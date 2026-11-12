import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/viewer';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: rows } = await supabase.from('accounts').select('company_id');
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.company_id, (counts.get(r.company_id) ?? 0) + 1);

  const companies = viewer.companies.filter((c) => !c.archived_at);
  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Signed in as {viewer.displayName}{viewer.isOwner && ' · Owner'}</p>

      {companies.length === 0 && (
        <div className="card">
          {viewer.isOwner
            ? <p>No companies yet. <Link href="/companies/new">Create the first one</Link> from a template.</p>
            : <p>You have not been given access to any company yet. Ask the owner.</p>}
        </div>
      )}

      <div className="grid">
        {companies.map((c) => (
          <Link key={c.id} href={`/c/${c.id}/accounts`} className="card" style={{ color: 'inherit', display: 'block', marginBottom: 0 }}>
            <div className="row spread">
              <strong>{c.display_name}</strong>
              {c.kind === 'personal' ? <span className="badge">Personal</span> : <span className="badge green">{c.basis}</span>}
            </div>
            <div className="muted small">{c.legal_name}</div>
            <div className="small" style={{ marginTop: 8 }}>
              {counts.get(c.id) ?? 0} accounts{c.lock_date ? ` · locked through ${c.lock_date}` : ''}
            </div>
          </Link>
        ))}
      </div>

      <div className="notice small" style={{ marginTop: 24 }}>
        Phase 1 covers sign-in, companies, roles, and the chart of accounts. Ledger, journal entries and reports arrive in Phase 2.
      </div>
    </>
  );
}
