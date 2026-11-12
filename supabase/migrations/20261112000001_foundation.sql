-- MyBooks Phase 1: foundation
-- Companies, membership with capabilities, chart of accounts, audit log, row-level security.
-- Designed for Supabase (auth.users, auth.uid(), auth.jwt()). Every policy requires an
-- MFA-verified session (aal2), so a password alone never reaches data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.company_kind as enum ('business', 'personal');
create type public.accounting_basis as enum ('accrual', 'cash');
create type public.account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');

-- ---------------------------------------------------------------------------
-- Reference: capabilities and account subtypes
-- ---------------------------------------------------------------------------
create or replace function public.known_capabilities() returns text[]
language sql immutable as $$
  select array[
    'reports.view',       -- view reports and registers
    'invoices.write',     -- create and edit invoices and customers
    'bills.write',        -- enter bills, record payments, edit vendors
    'journal.post',       -- post journal entries
    'reconcile',          -- reconcile accounts
    'coa.edit',           -- edit the chart of accounts
    'lock_date.set',      -- set the period lock date
    'import.all',         -- import CSV and PDF files of any kind
    'import.documents',   -- import invoices and bills only
    'tin.reveal'          -- reveal full taxpayer IDs and W-9s (logged)
  ]::text[]
$$;

-- subtype -> the account type it belongs to. Used by a check constraint.
create or replace function public.subtype_type(s text) returns public.account_type
language sql immutable as $$
  select case s
    when 'bank' then 'asset'
    when 'accounts_receivable' then 'asset'
    when 'other_current_asset' then 'asset'
    when 'fixed_asset' then 'asset'
    when 'accumulated_depreciation' then 'asset'
    when 'other_asset' then 'asset'
    when 'accounts_payable' then 'liability'
    when 'credit_card' then 'liability'
    when 'other_current_liability' then 'liability'
    when 'long_term_liability' then 'liability'
    when 'equity' then 'equity'
    when 'retained_earnings' then 'equity'
    when 'income' then 'income'
    when 'other_income' then 'income'
    when 'cost_of_services' then 'expense'
    when 'expense' then 'expense'
    when 'other_expense' then 'expense'
  end::public.account_type
$$;

create or replace function public.default_cash_flow_class(s text) returns text
language sql immutable as $$
  select case s
    when 'bank' then 'cash'
    when 'fixed_asset' then 'investing'
    when 'accumulated_depreciation' then 'investing'
    when 'other_asset' then 'investing'
    when 'long_term_liability' then 'financing'
    when 'equity' then 'financing'
    when 'retained_earnings' then 'financing'
    else 'operating'
  end
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Exactly one profile may be the owner.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_single_owner on public.profiles (is_owner) where is_owner;

-- New auth users get a profile with no access. Access comes only from the owner.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(btrim(legal_name)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  kind public.company_kind not null default 'business',
  basis public.accounting_basis not null default 'accrual',
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  lock_date date,
  template_keys text[] not null default '{}',
  archived_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index companies_display_name_key on public.companies (lower(display_name));
-- Only one personal book.
create unique index companies_single_personal on public.companies (kind) where kind = 'personal';

-- ---------------------------------------------------------------------------
-- Memberships: who can do what in which company. The owner needs no membership.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  preset text not null default 'viewer' check (preset in ('accountant', 'operator', 'viewer', 'custom')),
  capabilities text[] not null default '{}' check (capabilities <@ public.known_capabilities()),
  end_date date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- The personal book is owner-only: no one else may be a member.
create or replace function public.memberships_guard() returns trigger
language plpgsql as $$
declare k public.company_kind;
begin
  select kind into k from public.companies where id = new.company_id;
  if k = 'personal' then
    raise exception 'The personal book is owner-only; no memberships are allowed' using errcode = '23514';
  end if;
  if exists (select 1 from public.profiles where id = new.user_id and is_owner) then
    raise exception 'The owner has access to every company and needs no membership' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger memberships_guard before insert or update on public.memberships
  for each row execute function public.memberships_guard();

-- ---------------------------------------------------------------------------
-- Permission helpers. All of them require an MFA-verified session.
-- ---------------------------------------------------------------------------
create or replace function public.is_aal2() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_aal2()
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner)
$$;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or (public.is_aal2() and exists (
            select 1
            from public.memberships m
            join public.companies co on co.id = m.company_id
            where m.company_id = c
              and m.user_id = auth.uid()
              and co.kind <> 'personal'
              and (m.end_date is null or m.end_date >= current_date)))
$$;

create or replace function public.has_capability(c uuid, cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or (public.is_aal2() and exists (
            select 1
            from public.memberships m
            join public.companies co on co.id = m.company_id
            where m.company_id = c
              and m.user_id = auth.uid()
              and co.kind <> 'personal'
              and (m.end_date is null or m.end_date >= current_date)
              and cap = any (m.capabilities)))
$$;

-- ---------------------------------------------------------------------------
-- Report lines: group-level lines that consolidation sums by (reference data).
-- ---------------------------------------------------------------------------
create table public.report_lines (
  key text primary key,
  name text not null,
  section text not null check (section in (
    'asset', 'liability', 'equity', 'income', 'direct_cost', 'expense', 'other')),
  sort_order integer not null
);

-- ---------------------------------------------------------------------------
-- Chart of accounts (per company)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text check (number is null or number ~ '^[^[:space:]]{1,16}$'),
  name text not null check (length(btrim(name)) > 0),
  type public.account_type not null,
  subtype text not null,
  parent_id uuid references public.accounts (id) on delete restrict,
  report_line_key text not null references public.report_lines (key),
  cash_flow_class text not null check (cash_flow_class in ('cash', 'operating', 'investing', 'financing')),
  active boolean not null default true,
  is_system boolean not null default false,
  template_account_key text,
  created_at timestamptz not null default now(),
  constraint accounts_subtype_matches_type check (public.subtype_type(subtype) = type)
);
create unique index accounts_company_number_key on public.accounts (company_id, number) where number is not null;
create unique index accounts_company_name_key
  on public.accounts (company_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index accounts_company_template_key
  on public.accounts (company_id, template_account_key) where template_account_key is not null;
create index accounts_parent_idx on public.accounts (parent_id);

-- Phase 2 replaces this with a check against journal lines. Until then no account has activity.
create or replace function public.account_has_activity(a uuid) returns boolean
language sql stable as $$ select false $$;

create or replace function public.accounts_guard() returns trigger
language plpgsql as $$
declare p record;
declare depth int := 0;
declare cur uuid;
begin
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then
      raise exception 'An account cannot move to another company' using errcode = '23514';
    end if;
    if old.is_system and (new.type <> old.type or new.subtype <> old.subtype or new.active = false or new.is_system = false) then
      raise exception 'System accounts keep their type and stay active' using errcode = '23514';
    end if;
  end if;

  if new.parent_id is not null then
    select company_id, type into p from public.accounts where id = new.parent_id;
    if p.company_id is distinct from new.company_id then
      raise exception 'A parent account must belong to the same company' using errcode = '23514';
    end if;
    if p.type is distinct from new.type then
      raise exception 'A parent account must have the same type' using errcode = '23514';
    end if;
    -- cycle check
    cur := new.parent_id;
    while cur is not null loop
      if tg_op = 'UPDATE' and cur = new.id then
        raise exception 'An account cannot be its own ancestor' using errcode = '23514';
      end if;
      depth := depth + 1;
      if depth > 8 then
        raise exception 'Accounts can be nested at most 8 levels deep' using errcode = '23514';
      end if;
      select parent_id into cur from public.accounts where id = cur;
    end loop;
  end if;
  return new;
end $$;
create trigger accounts_guard before insert or update on public.accounts
  for each row execute function public.accounts_guard();

-- ---------------------------------------------------------------------------
-- Templates: one base chart per company kind plus optional modules. Editable by the owner.
-- ---------------------------------------------------------------------------
create table public.account_templates (
  key text primary key,
  name text not null,
  scope text not null check (scope in ('business_base', 'module', 'personal')),
  description text not null default '',
  version integer not null default 1,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.template_accounts (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.account_templates (key) on delete cascade,
  key text not null unique,
  number text check (number is null or number ~ '^[^[:space:]]{1,16}$'),
  name text not null check (length(btrim(name)) > 0),
  type public.account_type not null,
  subtype text not null,
  parent_key text references public.template_accounts (key) on update cascade on delete set null,
  report_line_key text not null references public.report_lines (key),
  cash_flow_class text check (cash_flow_class is null or cash_flow_class in ('cash', 'operating', 'investing', 'financing')),
  is_system boolean not null default false,
  sort_order integer not null default 0,
  constraint template_accounts_subtype_matches_type check (public.subtype_type(subtype) = type)
);
create index template_accounts_template_idx on public.template_accounts (template_key);

-- ---------------------------------------------------------------------------
-- Audit log: append-only record of changes.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  company_id uuid,
  action text not null,
  table_name text,
  record_id text,
  before jsonb,
  after jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_company_idx on public.audit_log (company_id, at desc);

create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  j_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  rec jsonb := coalesce(j_new, j_old);
  cid uuid;
begin
  -- Bulk operations (template copy) write one summary row themselves.
  if coalesce(current_setting('mybooks.bulk', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and j_new = j_old then
    return new;
  end if;
  cid := case when tg_table_name = 'companies' then (rec ->> 'id')::uuid else (rec ->> 'company_id')::uuid end;
  insert into public.audit_log (user_id, company_id, action, table_name, record_id, before, after)
  values (auth.uid(), cid, lower(tg_op), tg_table_name, rec ->> 'id', j_old, j_new);
  return coalesce(new, old);
end $$;

create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.audit_row_change();
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.audit_row_change();
create trigger audit_accounts after insert or update or delete on public.accounts
  for each row execute function public.audit_row_change();
create trigger audit_account_templates after insert or update or delete on public.account_templates
  for each row execute function public.audit_row_change();
create trigger audit_template_accounts after insert or update or delete on public.template_accounts
  for each row execute function public.audit_row_change();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Copy the accounts of the given templates into a company. Accounts already present
-- (matched on template_account_key) are skipped; a number already in use is dropped
-- rather than collided. Returns the number of accounts added.
create or replace function public.copy_template_accounts(p_company uuid, p_templates text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  added integer;
begin
  perform set_config('mybooks.bulk', 'on', true);

  with src as (
    select ta.*
    from public.template_accounts ta
    join public.account_templates t on t.key = ta.template_key
    where ta.template_key = any (p_templates)
      and not exists (
        select 1 from public.accounts a
        where a.company_id = p_company and a.template_account_key = ta.key)
  ), ins as (
    insert into public.accounts (company_id, number, name, type, subtype, report_line_key,
                                 cash_flow_class, is_system, template_account_key)
    select p_company,
           case when s.number is not null and not exists (
                  select 1 from public.accounts a where a.company_id = p_company and a.number = s.number)
                then s.number end,
           s.name, s.type, s.subtype, s.report_line_key,
           coalesce(s.cash_flow_class, public.default_cash_flow_class(s.subtype)),
           s.is_system, s.key
    from src s
    order by s.sort_order
    returning id
  )
  select count(*) into added from ins;

  -- Resolve parents (a second pass so order does not matter).
  update public.accounts a
     set parent_id = p.id
    from public.template_accounts ta
    join public.accounts p on p.company_id = p_company and p.template_account_key = ta.parent_key
   where a.company_id = p_company
     and a.template_account_key = ta.key
     and ta.parent_key is not null
     and a.parent_id is null
     and a.template_account_key is not null;

  perform set_config('mybooks.bulk', 'off', true);
  return added;
end $$;
revoke all on function public.copy_template_accounts(uuid, text[]) from public, anon, authenticated;

create or replace function public.create_company_from_template(
  p_legal_name text,
  p_display_name text,
  p_kind public.company_kind,
  p_basis public.accounting_basis,
  p_fiscal_year_start_month integer,
  p_modules text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  tmpl text[];
  n integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can create companies' using errcode = '42501';
  end if;

  if p_kind = 'personal' then
    tmpl := array['personal'];
    p_modules := '{}';
  else
    if exists (
      select 1 from unnest(coalesce(p_modules, '{}')) m
      where not exists (select 1 from public.account_templates t where t.key = m and t.scope = 'module')
    ) then
      raise exception 'Unknown template module' using errcode = '22023';
    end if;
    tmpl := array['business_base'] || coalesce(p_modules, '{}');
  end if;

  insert into public.companies (legal_name, display_name, kind, basis, fiscal_year_start_month, template_keys, created_by)
  values (btrim(p_legal_name), btrim(p_display_name), p_kind, p_basis, p_fiscal_year_start_month, tmpl, auth.uid())
  returning id into new_id;

  n := public.copy_template_accounts(new_id, tmpl);

  insert into public.audit_log (user_id, company_id, action, table_name, record_id, after)
  values (auth.uid(), new_id, 'create_from_template', 'companies', new_id::text,
          jsonb_build_object('templates', tmpl, 'accounts_added', n));
  return new_id;
end $$;
revoke all on function public.create_company_from_template(text, text, public.company_kind, public.accounting_basis, integer, text[]) from public, anon;
grant execute on function public.create_company_from_template(text, text, public.company_kind, public.accounting_basis, integer, text[]) to authenticated;

-- Add a module (or refresh from the company's own templates) on an existing company.
create or replace function public.apply_templates_to_company(p_company uuid, p_modules text[] default '{}')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  k public.company_kind;
  tmpl text[];
  n integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can apply templates' using errcode = '42501';
  end if;
  select kind, template_keys into k, tmpl from public.companies where id = p_company;
  if not found then
    raise exception 'Company not found' using errcode = '22023';
  end if;
  if k = 'personal' and coalesce(array_length(p_modules, 1), 0) > 0 then
    raise exception 'The personal book takes no modules' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_modules, '{}')) m
    where not exists (select 1 from public.account_templates t where t.key = m and t.scope = 'module')
  ) then
    raise exception 'Unknown template module' using errcode = '22023';
  end if;

  tmpl := (select array(select distinct x from unnest(tmpl || coalesce(p_modules, '{}')) x));
  update public.companies set template_keys = tmpl where id = p_company;
  n := public.copy_template_accounts(p_company, tmpl);

  insert into public.audit_log (user_id, company_id, action, table_name, record_id, after)
  values (auth.uid(), p_company, 'apply_templates', 'companies', p_company::text,
          jsonb_build_object('templates', tmpl, 'accounts_added', n));
  return n;
end $$;
revoke all on function public.apply_templates_to_company(uuid, text[]) from public, anon;
grant execute on function public.apply_templates_to_company(uuid, text[]) to authenticated;

-- Lock date can be set by anyone with the capability (the accountant by default),
-- without giving them general write access to the company row.
create or replace function public.set_lock_date(p_company uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability(p_company, 'lock_date.set') then
    raise exception 'Not allowed to set the lock date' using errcode = '42501';
  end if;
  update public.companies set lock_date = p_date where id = p_company;
end $$;
revoke all on function public.set_lock_date(uuid, date) from public, anon;
grant execute on function public.set_lock_date(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.report_lines enable row level security;
alter table public.accounts enable row level security;
alter table public.account_templates enable row level security;
alter table public.template_accounts enable row level security;
alter table public.audit_log enable row level security;

-- profiles: your own row; the owner sees everyone. Only display_name is writable (column grant).
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_aal2() and (id = auth.uid() or public.is_owner()));
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_aal2() and id = auth.uid())
  with check (public.is_aal2() and id = auth.uid());

-- companies: members read; only the owner writes.
create policy companies_select on public.companies for select to authenticated
  using (public.is_member(id));
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_owner());
create policy companies_update on public.companies for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_owner());

-- memberships: you see your own; only the owner writes.
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_aal2() and (user_id = auth.uid() or public.is_owner()));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.is_owner());
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_owner());

-- reference data
create policy report_lines_select on public.report_lines for select to authenticated
  using (public.is_aal2());

-- accounts: members read; coa.edit writes; deletion only for unused, non-system accounts.
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_member(company_id));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (public.has_capability(company_id, 'coa.edit') and not is_system);
create policy accounts_update on public.accounts for update to authenticated
  using (public.has_capability(company_id, 'coa.edit'))
  with check (public.has_capability(company_id, 'coa.edit'));
create policy accounts_delete on public.accounts for delete to authenticated
  using (public.has_capability(company_id, 'coa.edit')
         and not is_system
         and not public.account_has_activity(id));

-- templates: any signed-in user may read; the owner edits.
create policy account_templates_select on public.account_templates for select to authenticated
  using (public.is_aal2());
create policy account_templates_write on public.account_templates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy template_accounts_select on public.template_accounts for select to authenticated
  using (public.is_aal2());
create policy template_accounts_write on public.template_accounts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- audit log: the owner reads; nobody writes directly (triggers and functions only).
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Table privileges: nothing by default, then only what the policies above need.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.report_lines to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.account_templates to authenticated;
grant select, insert, update, delete on public.template_accounts to authenticated;
grant select on public.audit_log to authenticated;
