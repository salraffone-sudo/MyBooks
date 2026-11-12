import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTANT, OPERATOR, VIEWER, addMember, createTestDb, makeCompany, type TestDb } from './helpers';

let db: TestDb;
let owner: string, accountant: string, operator: string, viewer: string, stranger: string;
let svc: string, rea: string, personal: string;

beforeAll(async () => {
  db = await createTestDb();
  owner = await db.addUser('owner@example.com', { owner: true });
  accountant = await db.addUser('cpa@example.com');
  operator = await db.addUser('ops@example.com');
  viewer = await db.addUser('view@example.com');
  stranger = await db.addUser('nobody@example.com');

  svc = await makeCompany(db, owner, 'Studio', ['service_business']);
  rea = await makeCompany(db, owner, 'Holdings One', ['real_estate']);
  personal = await makeCompany(db, owner, 'Personal', [], 'personal');

  await addMember(db, svc, accountant, 'accountant', ACCOUNTANT);
  await addMember(db, svc, operator, 'operator', OPERATOR);
  await addMember(db, svc, viewer, 'viewer', VIEWER);
});

afterAll(async () => {
  await db?.close();
});

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.admin(sql, params)).rows[0].n);

describe('templates', () => {
  it('seeds the base chart, three modules and personal', async () => {
    const r = await db.admin('select template_key, count(*)::int n from template_accounts group by 1 order by 1');
    expect(Object.fromEntries(r.rows.map((x) => [x.template_key, x.n]))).toEqual({
      business_base: 38, holding_company: 2, personal: 25, real_estate: 18, service_business: 6,
    });
  });

  it('keeps numbers unique when base and every module are combined', async () => {
    const r = await db.admin(
      `select number, count(*)::int n from template_accounts
        where template_key in ('business_base','service_business','real_estate','holding_company')
        group by number having count(*) > 1`);
    expect(r.rows).toEqual([]);
  });

  it('keeps numbers unique inside the personal template', async () => {
    const r = await db.admin(
      `select number from template_accounts where template_key = 'personal' group by number having count(*) > 1`);
    expect(r.rows).toEqual([]);
  });

  it('every parent sits in the same template or the base chart, with the same type', async () => {
    const r = await db.admin(
      `select c.key from template_accounts c join template_accounts p on p.key = c.parent_key
        where p.type <> c.type or (p.template_key <> c.template_key and p.template_key <> 'business_base')`);
    expect(r.rows).toEqual([]);
  });

  it('seeding did not write to the audit log', async () => {
    expect(await count(`select count(*) n from audit_log where table_name in ('template_accounts','account_templates')`)).toBe(0);
  });
});

describe('creating companies', () => {
  it('builds a service business from base + module with hierarchy and system accounts', async () => {
    expect(await count('select count(*) n from accounts where company_id = $1', [svc])).toBe(44);
    const sub = await db.admin(
      `select a.name, p.name as parent from accounts a join accounts p on p.id = a.parent_id
        where a.company_id = $1 and a.name = 'Accounting'`, [svc]);
    expect(sub.rows[0].parent).toBe('Professional fees');
    const sys = await db.admin(
      `select number from accounts where company_id = $1 and is_system order by number`, [svc]);
    expect(sys.rows.map((r) => r.number)).toEqual(['1100', '2000', '3900', '3999', '4990', '6990', '6999']);
  });

  it('sets cash-flow classes from subtype', async () => {
    const r = await db.admin(
      `select number, cash_flow_class from accounts where company_id = $1 and number in ('1010','1550','2000','3000')`, [rea]);
    const m = Object.fromEntries(r.rows.map((x) => [x.number, x.cash_flow_class]));
    expect(m).toEqual({ '1010': 'cash', '1550': 'investing', '2000': 'operating', '3000': 'financing' });
  });

  it('the real estate module adds land (not depreciated class) and the accumulated depreciation accounts', async () => {
    const r = await db.admin(
      `select number, subtype from accounts where company_id = $1 and number between '1500' and '1650' order by number`, [rea]);
    expect(r.rows.map((x) => x.number)).toEqual(['1500','1510','1520','1530','1540','1550','1590','1610','1620','1630','1640','1650']);
    expect(r.rows.find((x) => x.number === '1610')!.subtype).toBe('accumulated_depreciation');
  });

  it('puts property taxes and mortgage interest under their base parents', async () => {
    const r = await db.admin(
      `select a.name, p.name as parent from accounts a join accounts p on p.id = a.parent_id
        where a.company_id = $1 and a.name in ('Property taxes','Mortgage interest') order by a.name`, [rea]);
    expect(r.rows).toEqual([
      { name: 'Mortgage interest', parent: 'Interest expense' },
      { name: 'Property taxes', parent: 'Taxes and licenses' },
    ]);
  });

  it('records what it did in the audit log as one summary row, not one per account', async () => {
    const r = await db.admin(
      `select after from audit_log where company_id = $1 and action = 'create_from_template'`, [svc]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].after.accounts_added).toBe(44);
    expect(await count(`select count(*) n from audit_log where company_id = $1 and table_name = 'accounts'`, [svc])).toBe(0);
  });

  it('the personal book uses only the personal template, and there can be only one', async () => {
    expect(await count('select count(*) n from accounts where company_id = $1', [personal])).toBe(25);
    await expect(makeCompany(db, owner, 'Personal Two', [], 'personal')).rejects.toThrow(/companies_single_personal/);
  });

  it('rejects an unknown module', async () => {
    await expect(makeCompany(db, owner, 'Bad', ['nope'])).rejects.toThrow(/Unknown template module/);
  });

  it('only the owner can create companies', async () => {
    await expect(makeCompany(db, accountant, 'Sneaky')).rejects.toThrow(/Only the owner/);
  });
});

describe('MFA and visibility', () => {
  it('a session that has not passed MFA sees nothing, even the owner', async () => {
    const r = await db.as({ id: owner, aal: 'aal1' }, (q) => q('select * from companies'));
    expect(r.rowCount).toBe(0);
    await expect(
      db.as({ id: owner, aal: 'aal1' }, (q) => q(`select public.create_company_from_template('x','x','business','accrual',1,'{}')`)),
    ).rejects.toThrow(/Only the owner/);
  });

  it('the owner sees every company including the personal book', async () => {
    const r = await db.as({ id: owner }, (q) => q('select display_name from companies order by 1'));
    expect(r.rows.map((x) => x.display_name)).toEqual(['Holdings One', 'Personal', 'Studio']);
  });

  it('a member sees only the companies they belong to', async () => {
    const r = await db.as({ id: accountant }, (q) => q('select display_name from companies'));
    expect(r.rows.map((x) => x.display_name)).toEqual(['Studio']);
    const a = await db.as({ id: accountant }, (q) => q('select count(*)::int n from accounts where company_id = $1', [rea]));
    expect(a.rows[0].n).toBe(0);
  });

  it('a user with no membership sees nothing', async () => {
    const r = await db.as({ id: stranger }, (q) => q('select * from companies'));
    expect(r.rowCount).toBe(0);
  });

  it('an expired membership stops working', async () => {
    const u = await db.addUser('expired@example.com');
    await addMember(db, svc, u, 'accountant', ACCOUNTANT, '2020-01-01');
    const r = await db.as({ id: u }, (q) => q('select * from companies'));
    expect(r.rowCount).toBe(0);
  });

  it('the personal book is invisible to members and cannot be shared', async () => {
    const r = await db.as({ id: accountant }, (q) => q('select * from companies where id = $1', [personal]));
    expect(r.rowCount).toBe(0);
    await expect(addMember(db, personal, accountant, 'viewer', VIEWER)).rejects.toThrow(/owner-only/);
  });

  it('the owner cannot be given a membership', async () => {
    await expect(addMember(db, svc, owner, 'viewer', VIEWER)).rejects.toThrow(/needs no membership/);
  });
});

describe('capabilities', () => {
  it('accountant (coa.edit) can rename and add accounts', async () => {
    await db.as({ id: accountant }, async (q) => {
      const r = await q(`update accounts set name = 'Bookkeeping' where company_id = $1 and number = '6210'`, [svc]);
      expect(r.rowCount).toBe(1);
      await q(`insert into accounts (company_id, number, name, type, subtype, report_line_key, cash_flow_class)
               values ($1, '1015', 'Money market', 'asset', 'bank', 'cash_bank', 'cash')`, [svc]);
    });
    expect(await count(`select count(*) n from accounts where company_id = $1 and number = '1015'`, [svc])).toBe(1);
  });

  it('operator and viewer cannot edit the chart', async () => {
    for (const u of [operator, viewer]) {
      const upd = await db.as({ id: u }, (q) => q(`update accounts set name = 'Hacked' where company_id = $1 and number = '6000'`, [svc]));
      expect(upd.rowCount).toBe(0);
      await expect(
        db.as({ id: u }, (q) => q(`insert into accounts (company_id, number, name, type, subtype, report_line_key, cash_flow_class)
                                   values ($1, '9999', 'x', 'expense', 'expense', 'other_expense', 'operating')`, [svc])),
      ).rejects.toThrow(/row-level security/);
    }
    expect(await count(`select count(*) n from accounts where company_id = $1 and name = 'Hacked'`, [svc])).toBe(0);
  });

  it('an accountant on one company cannot edit another', async () => {
    const upd = await db.as({ id: accountant }, (q) => q(`update accounts set name = 'x' where company_id = $1`, [rea]));
    expect(upd.rowCount).toBe(0);
  });

  it('members cannot touch memberships or companies', async () => {
    await expect(
      db.as({ id: accountant }, (q) => q(`insert into memberships (company_id, user_id, preset, capabilities) values ($1,$2,'viewer','{}')`, [svc, stranger])),
    ).rejects.toThrow(/row-level security/);
    const upd = await db.as({ id: accountant }, (q) =>
      q(`update memberships set capabilities = $2 where user_id = $1`, [accountant, ['coa.edit', 'tin.reveal', 'journal.post']]));
    expect(upd.rowCount).toBe(0);
    const co = await db.as({ id: accountant }, (q) => q(`update companies set display_name = 'Mine' where id = $1`, [svc]));
    expect(co.rowCount).toBe(0);
  });

  it('a user can read their own membership but not others', async () => {
    const r = await db.as({ id: operator }, (q) => q('select user_id from memberships'));
    expect(r.rows.map((x) => x.user_id)).toEqual([operator]);
  });

  it('rejects unknown capabilities', async () => {
    await expect(addMember(db, svc, stranger, 'custom', ['root.access'])).rejects.toThrow(/capabilities/);
  });

  it('nobody but the service role can make themselves the owner', async () => {
    await expect(
      db.as({ id: accountant }, (q) => q(`update profiles set is_owner = true where id = $1`, [accountant])),
    ).rejects.toThrow(/permission denied/);
    await expect(db.addUser('second-owner@example.com', { owner: true })).rejects.toThrow(/profiles_single_owner/);
  });

  it('profiles: own row only, owner sees all', async () => {
    const mine = await db.as({ id: viewer }, (q) => q('select email from profiles'));
    expect(mine.rows).toEqual([{ email: 'view@example.com' }]);
    const all = await db.as({ id: owner }, (q) => q('select count(*)::int n from profiles'));
    expect(all.rows[0].n).toBeGreaterThanOrEqual(5);
  });
});

describe('lock date', () => {
  it('accountant can set it, operator cannot, owner can', async () => {
    await db.as({ id: accountant }, (q) => q(`select set_lock_date($1, '2026-09-30')`, [svc]));
    expect((await db.admin('select lock_date::text d from companies where id = $1', [svc])).rows[0].d).toBe('2026-09-30');
    await expect(db.as({ id: operator }, (q) => q(`select set_lock_date($1, '2026-01-01')`, [svc]))).rejects.toThrow(/Not allowed/);
    await db.as({ id: owner }, (q) => q(`select set_lock_date($1, '2026-10-31')`, [svc]));
    expect((await db.admin('select lock_date::text d from companies where id = $1', [svc])).rows[0].d).toBe('2026-10-31');
  });
});

describe('account rules', () => {
  it('rejects a subtype that does not match the type', async () => {
    await expect(
      db.as({ id: owner }, (q) => q(`insert into accounts (company_id, name, type, subtype, report_line_key, cash_flow_class)
                                     values ($1, 'Bad', 'asset', 'expense', 'other_expense', 'operating')`, [svc])),
    ).rejects.toThrow(/accounts_subtype_matches_type/);
  });

  it('numbers are unique per company but may repeat across companies', async () => {
    await expect(
      db.as({ id: owner }, (q) => q(`update accounts set number = '1010' where company_id = $1 and number = '1020'`, [svc])),
    ).rejects.toThrow(/accounts_company_number_key/);
    expect(await count(`select count(*) n from accounts where number = '1010'`)).toBeGreaterThanOrEqual(3);
  });

  it('numbers are optional and free-form', async () => {
    await db.as({ id: owner }, (q) => q(`insert into accounts (company_id, number, name, type, subtype, report_line_key, cash_flow_class)
                                          values ($1, null, 'Petty cash', 'asset', 'bank', 'cash_bank', 'cash'),
                                                 ($1, 'X-7', 'Escrow reserve', 'asset', 'other_current_asset', 'other_current_assets', 'operating')`, [svc]));
    await expect(
      db.as({ id: owner }, (q) => q(`insert into accounts (company_id, number, name, type, subtype, report_line_key, cash_flow_class)
                                      values ($1, 'has space', 'Bad number', 'asset', 'bank', 'cash_bank', 'cash')`, [svc])),
    ).rejects.toThrow(/accounts_number_check/);
  });

  it('names are unique under the same parent', async () => {
    await expect(
      db.as({ id: owner }, (q) => q(`insert into accounts (company_id, name, type, subtype, report_line_key, cash_flow_class)
                                      values ($1, 'petty CASH', 'asset', 'bank', 'cash_bank', 'cash')`, [svc])),
    ).rejects.toThrow(/accounts_company_name_key/);
  });

  it('parents must share company and type, and cannot form a cycle', async () => {
    const ids = await db.admin(
      `select (select id from accounts where company_id=$1 and number='6200') as prof,
              (select id from accounts where company_id=$1 and number='6210') as acct,
              (select id from accounts where company_id=$1 and number='1010') as bank,
              (select id from accounts where company_id=$2 and number='6200') as other_prof`, [svc, rea]);
    const { prof, acct, bank, other_prof } = ids.rows[0];
    await expect(db.as({ id: owner }, (q) => q('update accounts set parent_id = $1 where id = $2', [bank, acct]))).rejects.toThrow(/same type/);
    await expect(db.as({ id: owner }, (q) => q('update accounts set parent_id = $1 where id = $2', [other_prof, acct]))).rejects.toThrow(/same company/);
    await expect(db.as({ id: owner }, (q) => q('update accounts set parent_id = $1 where id = $2', [acct, prof]))).rejects.toThrow(/own ancestor/);
  });

  it('system accounts keep their type and stay active, but can be renamed and renumbered', async () => {
    await expect(
      db.as({ id: owner }, (q) => q(`update accounts set active = false where company_id = $1 and number = '1100'`, [svc])),
    ).rejects.toThrow(/System accounts/);
    await db.as({ id: owner }, (q) => q(`update accounts set name = 'Trade receivables', number = '1110' where company_id = $1 and template_account_key = 'base.ar'`, [svc]));
    expect(await count(`select count(*) n from accounts where company_id = $1 and name = 'Trade receivables'`, [svc])).toBe(1);
  });

  it('an unused ordinary account can be deleted; a system account cannot', async () => {
    const del = await db.as({ id: accountant }, (q) => q(`delete from accounts where company_id = $1 and number = '1015'`, [svc]));
    expect(del.rowCount).toBe(1);
    const sys = await db.as({ id: accountant }, (q) => q(`delete from accounts where company_id = $1 and template_account_key = 'base.ap'`, [svc]));
    expect(sys.rowCount).toBe(0);
  });

  it('members cannot create system accounts', async () => {
    await expect(
      db.as({ id: accountant }, (q) => q(`insert into accounts (company_id, number, name, type, subtype, report_line_key, cash_flow_class, is_system)
                                           values ($1, '1999', 'Fake system', 'asset', 'bank', 'cash_bank', 'cash', true)`, [svc])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('applying templates to an existing company', () => {
  it('adds a module once, and is idempotent', async () => {
    const first = await db.as({ id: owner }, (q) => q(`select apply_templates_to_company($1, '{real_estate}') n`, [svc]));
    expect(first.rows[0].n).toBe(18);
    const again = await db.as({ id: owner }, (q) => q(`select apply_templates_to_company($1, '{real_estate}') n`, [svc]));
    expect(again.rows[0].n).toBe(0);
    const keys = (await db.admin('select template_keys from companies where id = $1', [svc])).rows[0].template_keys;
    expect(keys.sort()).toEqual(['business_base', 'real_estate', 'service_business']);
  });

  it('picks up an account added to a template later, and drops a colliding number instead of failing', async () => {
    await db.admin(`insert into template_accounts (template_key, key, number, name, type, subtype, report_line_key, sort_order)
                    values ('business_base', 'base.test.new', '1010', 'Test new account', 'asset', 'bank', 'cash_bank', 1)`);
    const r = await db.as({ id: owner }, (q) => q(`select apply_templates_to_company($1, '{}') n`, [svc]));
    expect(r.rows[0].n).toBe(1);
    const a = await db.admin(`select number from accounts where company_id = $1 and name = 'Test new account'`, [svc]);
    expect(a.rows[0].number).toBeNull();
    await db.admin(`delete from template_accounts where key = 'base.test.new'`);
  });

  it('only the owner can apply templates; the personal book takes no modules', async () => {
    await expect(db.as({ id: accountant }, (q) => q(`select apply_templates_to_company($1, '{real_estate}')`, [rea]))).rejects.toThrow(/Only the owner/);
    await expect(db.as({ id: owner }, (q) => q(`select apply_templates_to_company($1, '{real_estate}')`, [personal]))).rejects.toThrow(/no modules/);
  });

  it('templates are readable by members and writable only by the owner', async () => {
    const r = await db.as({ id: viewer }, (q) => q('select count(*)::int n from template_accounts'));
    expect(r.rows[0].n).toBeGreaterThan(80);
    await expect(
      db.as({ id: accountant }, (q) => q(`update account_templates set name = 'x' where key = 'business_base'`)),
    ).resolves.toMatchObject({ rowCount: 0 });
    await db.as({ id: owner }, (q) => q(`update account_templates set description = 'edited by owner' where key = 'personal'`));
    expect((await db.admin(`select description from account_templates where key = 'personal'`)).rows[0].description).toBe('edited by owner');
  });
});

describe('audit log', () => {
  it('records who changed what, with before and after', async () => {
    await db.as({ id: accountant }, (q) => q(`update accounts set name = 'Tax prep' where company_id = $1 and template_account_key = 'base.exp.prof.legal'`, [svc]));
    const r = await db.admin(
      `select user_id, action, before ->> 'name' as before_name, after ->> 'name' as after_name
         from audit_log where company_id = $1 and table_name = 'accounts' and action = 'update'
         order by id desc limit 1`, [svc]);
    expect(r.rows[0]).toEqual({ user_id: accountant, action: 'update', before_name: 'Legal', after_name: 'Tax prep' });
  });

  it('records membership changes', async () => {
    expect(await count(`select count(*) n from audit_log where table_name = 'memberships' and action = 'insert'`)).toBeGreaterThanOrEqual(3);
  });

  it('skips updates that change nothing', async () => {
    const before = await count('select count(*) n from audit_log');
    await db.as({ id: owner }, (q) => q(`update accounts set name = name where company_id = $1`, [svc]));
    expect(await count('select count(*) n from audit_log')).toBe(before);
  });

  it('is readable by the owner only', async () => {
    const o = await db.as({ id: owner }, (q) => q('select count(*)::int n from audit_log'));
    expect(o.rows[0].n).toBeGreaterThan(0);
    for (const u of [accountant, operator, viewer]) {
      const r = await db.as({ id: u }, (q) => q('select count(*)::int n from audit_log'));
      expect(r.rows[0].n).toBe(0);
    }
  });

  it('cannot be edited or deleted, by anyone', async () => {
    await expect(db.admin(`update audit_log set action = 'forged'`)).rejects.toThrow(/append-only/);
    await expect(db.admin(`delete from audit_log`)).rejects.toThrow(/append-only/);
    await expect(db.admin(`truncate audit_log`)).rejects.toThrow(/append-only/);
    await expect(db.as({ id: owner }, (q) => q(`delete from audit_log`))).rejects.toThrow(/permission denied/);
    await expect(db.as({ id: owner }, (q) => q(`insert into audit_log (action) values ('forged')`))).rejects.toThrow(/permission denied/);
  });
});

describe('what the app does as the owner, through the real role', () => {
  it('upserts a membership (grant, then change) and removes it', async () => {
    const u = await db.addUser('newhire@example.com');
    const row = (caps: string[], preset: string) => ({ company_id: rea, user_id: u, preset, capabilities: caps, end_date: null as string | null });
    const upsert = (r: ReturnType<typeof row>) => db.as({ id: owner }, (q) =>
      q(`insert into memberships (company_id, user_id, preset, capabilities, end_date) values ($1,$2,$3,$4,$5)
         on conflict (company_id, user_id) do update set preset = excluded.preset, capabilities = excluded.capabilities, end_date = excluded.end_date`,
        [r.company_id, r.user_id, r.preset, r.capabilities, r.end_date]));
    await upsert(row(VIEWER, 'viewer'));
    await upsert(row(OPERATOR, 'operator'));
    const m = await db.admin('select preset, capabilities from memberships where company_id = $1 and user_id = $2', [rea, u]);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].preset).toBe('operator');
    // The new member can now see exactly that company.
    const seen = await db.as({ id: u }, (q) => q('select display_name from companies'));
    expect(seen.rows.map((r) => r.display_name)).toEqual(['Holdings One']);
    const del = await db.as({ id: owner }, (q) => q('delete from memberships where company_id = $1 and user_id = $2', [rea, u]));
    expect(del.rowCount).toBe(1);
    expect((await db.as({ id: u }, (q) => q('select * from companies'))).rowCount).toBe(0);
  });

  it('archives and restores a company; members lose sight of nothing but the owner controls it', async () => {
    await db.as({ id: owner }, (q) => q('update companies set archived_at = now() where id = $1', [rea]));
    expect((await db.admin('select archived_at from companies where id = $1', [rea])).rows[0].archived_at).not.toBeNull();
    await db.as({ id: owner }, (q) => q('update companies set archived_at = null where id = $1', [rea]));
    const denied = await db.as({ id: accountant }, (q) => q('update companies set archived_at = now() where id = $1', [svc]));
    expect(denied.rowCount).toBe(0);
  });

  it('users can change their own display name and nothing else on their profile', async () => {
    await db.as({ id: viewer }, (q) => q(`update profiles set display_name = 'Vee' where id = $1`, [viewer]));
    await expect(db.as({ id: viewer }, (q) => q(`update profiles set email = 'x@y.z' where id = $1`, [viewer]))).rejects.toThrow(/permission denied/);
  });

  it('adds, edits and removes template accounts as the owner only', async () => {
    await db.as({ id: owner }, (q) => q(`insert into template_accounts (template_key, key, number, name, type, subtype, report_line_key, sort_order)
                                          values ('real_estate', 'real_estate.custom.t1', '6450', 'Snow removal', 'expense', 'expense', 'repairs_maintenance', 999)`));
    await db.as({ id: owner }, (q) => q(`update template_accounts set name = 'Snow and ice removal' where key = 'real_estate.custom.t1'`));
    const denied = await db.as({ id: accountant }, (q) => q(`delete from template_accounts where key = 'real_estate.custom.t1'`));
    expect(denied.rowCount).toBe(0);
    const del = await db.as({ id: owner }, (q) => q(`delete from template_accounts where key = 'real_estate.custom.t1' and is_system = false`));
    expect(del.rowCount).toBe(1);
  });
});
