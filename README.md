# MyBooks

Private multi-company bookkeeping for one owner and a few invited users. Phase 1 (this release) is the foundation: sign-in with two-step verification, companies, roles, the standard chart of accounts and company templates, an audit log, and row-level security. The ledger, reports, invoicing and imports arrive in later phases (see the design document).

Stack: Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres, Auth, row-level security), deployed on Vercel.

## How access works

- There is one **Owner**. Only the Owner creates companies, invites users, grants or removes access, and edits templates. The Owner sees everything, including the **Personal** books, which can never be shared.
- Everyone else gets a **membership per company**: a set of capabilities (for example `coa.edit`, `journal.post`, `reconcile`) and an optional end date. Presets (Accountant, Operator, Viewer) are just starting points.
- **Every account needs two-step sign-in** (authenticator app). The database refuses all reads and writes from a session that has not passed it, even if the app were bypassed.
- Sign-ups are disabled. Users exist only because the Owner invited them.

## Set up

### 1. Supabase

1. Create a project at supabase.com.
2. **Authentication → Sign In / Providers → Email**: keep email on; turn **Allow new users to sign up** OFF; set minimum password length to 12.
3. **Authentication → Multi-Factor**: make sure **TOTP** is enabled.
4. **Authentication → URL Configuration**: set Site URL to your production address (for example `https://mybooks.vercel.app`) and add `http://localhost:3000/auth/confirm` and `https://YOUR-DOMAIN/auth/confirm` to the redirect URLs.
5. **Authentication → Emails → Templates**: paste the bodies from `supabase/templates/invite.html` and `recovery.html` into the **Invite user** and **Reset password** templates. They link to `/auth/confirm?token_hash=…`, which is what the app expects.
6. **SQL Editor**: run the two files in `supabase/migrations/` in order (`…000001_foundation.sql`, then `…000002_report_lines_and_templates.sql`).
7. **Project Settings → API**: copy the project URL, the `anon` key and the `service_role` key.

### 2. Run locally

```bash
npm install
cp .env.example .env.local     # fill in the three Supabase values and NEXT_PUBLIC_SITE_URL
npm run bootstrap-owner -- you@example.com "Your Name"
npm run dev
```

`bootstrap-owner` creates the single Owner and prints a one-time link. Open it, choose a password, and enrol your authenticator. It refuses to run if an Owner already exists.

### 3. Deploy

Push this repository to GitHub, import it in Vercel, and add the same four environment variables (`SUPABASE_SERVICE_ROLE_KEY` must **not** be exposed to the browser; it is read only in server code). Set `NEXT_PUBLIC_SITE_URL` to the production address. Every push to `main` deploys.

### 4. Install on your phone

Open the site in Safari (iOS: Share → Add to Home Screen) or Chrome (Android: Install app). There is deliberately no offline cache: financial data is never stored on the device by the app.

## Tests

```bash
npm run test:unit     # no database needed
npm run test:db       # needs Postgres 16; set TEST_DATABASE_URL (default postgres://postgres@127.0.0.1:5433/postgres)
npm run typecheck
```

The database tests create a throwaway database, apply the migrations on top of a small stand-in for Supabase's `auth` schema, and exercise the real row-level-security policies by switching role and JWT claims. They cover MFA gating, per-company visibility, capability checks, the personal book, template integrity and application, account rules, and the append-only audit log. CI runs everything on each push (`.github/workflows/ci.yml`).

## Layout

- `supabase/migrations/` — schema, policies, functions, seed templates
- `src/lib/` — capabilities, chart-of-accounts helpers, Supabase clients, viewer
- `src/app/(auth)/` — sign-in, MFA, set-password, forgot-password
- `src/app/(app)/` — dashboard, companies, chart editor, settings, users, templates, audit log
- `src/proxy.ts` — refreshes the session and sends users to MFA when needed (Next.js 16 name for middleware)
- `scripts/` — `bootstrap-owner`, `make-icons`

## Notes for later phases

- `account_has_activity()` currently returns false. Phase 2 replaces it with a check against journal lines so used accounts cannot be deleted or change type.
- The period lock date is stored and permission-checked now; the ledger enforces it from Phase 2.
- Adding a module or editing a template never changes existing companies' accounts; it only adds missing ones.
