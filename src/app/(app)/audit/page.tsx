import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/viewer';

export const metadata = { title: 'Audit log' };
const PAGE = 50;

function summary(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (before && after) {
    const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    return keys.map((k) => `${k}: ${fmt(before[k])} → ${fmt(after[k])}`).join('; ');
  }
  const row = after ?? before;
  if (!row) return '';
  return String(row.name ?? row.display_name ?? row.email ?? row.user_id ?? '');
}
const fmt = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; company?: string }> }) {
  const viewer = await requireOwner();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const company = viewer.companies.find((c) => c.id === sp.company)?.id;

  const supabase = await createClient();
  let q = supabase.from('audit_log').select('id, at, user_id, company_id, action, table_name, before, after', { count: 'exact' }).order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (company) q = q.eq('company_id', company);
  const [{ data: rows, count }, { data: profiles }] = await Promise.all([q, supabase.from('profiles').select('id, email')]);
  const who = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const where = new Map(viewer.companies.map((c) => [c.id, c.display_name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/audit?page=${p}${company ? `&company=${company}` : ''}`;

  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Append-only. Nothing here can be edited or deleted, by anyone.</p>
      <form className="row inline" style={{ marginBottom: 12 }}>
        <select name="company" defaultValue={company ?? ''} aria-label="Company"><option value="">All companies</option>{viewer.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select>
        <button className="btn small">Filter</button>
      </form>
      <section className="card"><div className="table-wrap"><table>
        <thead><tr><th>When</th><th>Who</th><th>Company</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td className="nowrap small">{new Date(r.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td className="small">{r.user_id ? who.get(r.user_id) ?? 'removed user' : 'system'}</td>
              <td className="small">{r.company_id ? where.get(r.company_id) ?? '—' : '—'}</td>
              <td className="small">{r.table_name ? `${r.action} ${r.table_name}` : r.action}</td>
              <td className="small muted">{summary(r.before, r.after)}</td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={5} className="muted">Nothing recorded yet.</td></tr>}
        </tbody>
      </table></div></section>
      <div className="row spread">
        <span className="muted small">Page {page} of {pages}</span>
        <span className="row">{page > 1 && <Link className="btn small" href={href(page - 1)}>Newer</Link>}{page < pages && <Link className="btn small" href={href(page + 1)}>Older</Link>}</span>
      </div>
    </>
  );
}
