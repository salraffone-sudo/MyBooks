import { Pool, type QueryResult } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/postgres';

export type Q = (text: string, params?: unknown[]) => Promise<QueryResult>;
export type Actor = { id: string; aal?: 'aal1' | 'aal2' };

export interface TestDb {
  name: string;
  /** Superuser query (bypasses RLS). Use for setup and for checking results. */
  admin: Q;
  /** Run fn as a signed-in user (role authenticated, JWT claims set), in one transaction. */
  as: <T>(actor: Actor, fn: (q: Q) => Promise<T>) => Promise<T>;
  addUser: (email: string, opts?: { owner?: boolean }) => Promise<string>;
  close: () => Promise<void>;
}

/** Creates a throwaway database with the auth shim and every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const name = `mb_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
  await root.query(`create database ${name}`);
  await root.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  const pool = new Pool({ connectionString: url, max: 4 });

  await pool.query(readFileSync(join(ROOT, 'supabase/tests/auth_shim.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(dir, f), 'utf8'));
  }

  const admin: Q = (text, params) => pool.query(text, params);

  const as: TestDb['as'] = async (actor, fn) => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, aal: actor.aal ?? 'aal2', role: 'authenticated' }),
      ]);
      const result = await fn((text, params) => c.query(text, params));
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  };

  const addUser: TestDb['addUser'] = async (email, opts) => {
    const r = await admin('insert into auth.users (email) values ($1) returning id', [email]);
    const id = r.rows[0].id as string;
    if (opts?.owner) await admin('update public.profiles set is_owner = true where id = $1', [id]);
    return id;
  };

  const close = async () => {
    await pool.end();
    const r = new Pool({ connectionString: ADMIN_URL, max: 1 });
    await r.query(`drop database if exists ${name} with (force)`);
    await r.end();
  };

  return { name, admin, as, addUser, close };
}

/** Creates a company as the owner and returns its id. */
export async function makeCompany(
  db: TestDb,
  owner: string,
  display: string,
  modules: string[] = [],
  kind: 'business' | 'personal' = 'business',
): Promise<string> {
  const r = await db.as({ id: owner }, (q) =>
    q('select public.create_company_from_template($1, $2, $3, $4, $5, $6) as id', [
      `${display} LLC`, display, kind, 'accrual', 1, modules,
    ]),
  );
  return r.rows[0].id as string;
}

export async function addMember(
  db: TestDb, company: string, user: string, preset: string, capabilities: string[], endDate: string | null = null,
) {
  await db.admin(
    'insert into public.memberships (company_id, user_id, preset, capabilities, end_date) values ($1,$2,$3,$4,$5)',
    [company, user, preset, capabilities, endDate],
  );
}

export const ACCOUNTANT = ['reports.view', 'journal.post', 'reconcile', 'coa.edit', 'lock_date.set', 'import.all', 'tin.reveal'];
export const OPERATOR = ['reports.view', 'invoices.write', 'bills.write', 'import.documents'];
export const VIEWER = ['reports.view'];
