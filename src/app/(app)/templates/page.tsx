import Link from 'next/link';
import { ActionForm } from '@/components/Form';
import { createClient } from '@/lib/supabase/server';
import { SUBTYPES, TYPE_LABEL, TYPE_ORDER, accountLabel, buildTree, flatten, type Account } from '@/lib/accounts';
import { requireOwner } from '@/lib/viewer';
import TemplateRow from './TemplateRow';
import { addTemplateAccount } from './actions';

export const metadata = { title: 'Templates' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requireOwner();
  const { t } = await searchParams;
  const supabase = await createClient();
  const [{ data: templates }, { data: lines }] = await Promise.all([
    supabase.from('account_templates').select('key, name, description, scope').order('sort_order'),
    supabase.from('report_lines').select('key, name').order('sort_order'),
  ]);
  const list = templates ?? [];
  const current = list.find((x) => x.key === t) ?? list[0];
  if (!current) return <p>No templates found.</p>;

  const { data: rows } = await supabase.from('template_accounts').select('*').order('sort_order');
  const all = rows ?? [];
  // Accounts in a module may sit under base-chart parents, so show those parents for context.
  const mine = all.filter((r) => r.template_key === current.key);
  const parentKeys = new Set(mine.map((r) => r.parent_key).filter(Boolean));
  const context = all.filter((r) => r.template_key !== current.key && (current.scope === 'module' ? r.template_key === 'business_base' : false) && parentKeys.has(r.key));
  const asAccount = (r: (typeof all)[number]): Account => ({
    id: r.key, company_id: r.template_key, number: r.number, name: r.name, type: r.type, subtype: r.subtype, parent_id: r.parent_key,
    report_line_key: r.report_line_key, cash_flow_class: r.cash_flow_class ?? 'operating', active: true, is_system: r.is_system,
  });
  const byKey = new Map(all.map((r) => [r.key, r]));
  const lineName = (k: string) => lines?.find((l) => l.key === k)?.name ?? k;
  const parentChoices = flatten(buildTree([...context, ...mine].map(asAccount)));

  return (
    <>
      <h1>Templates</h1>
      <p className="muted">New companies copy the base chart plus the modules you pick. Editing a template never changes companies that already exist.</p>
      <nav className="nav" style={{ marginBottom: 12 }} aria-label="Templates">
        {list.map((x) => <Link key={x.key} href={`/templates?t=${x.key}`} aria-current={x.key === current.key ? 'page' : undefined}>{x.name}</Link>)}
      </nav>
      <p className="muted small">{current.description}</p>

      <section className="card">
        <div className="table-wrap"><table>
          <thead><tr><th style={{ width: 90 }}>No.</th><th>Name</th><th className="hide-sm">Type</th><th className="hide-sm">Report line</th><th /></tr></thead>
          <tbody>
            {TYPE_ORDER.flatMap((ty) => {
              const nodes = flatten(buildTree([...context, ...mine].map(asAccount), ty));
              if (!nodes.length) return [];
              return [
                <tr key={`h-${ty}`} className="group"><td colSpan={5}>{TYPE_LABEL[ty]}</td></tr>,
                ...nodes.map((n) => {
                  const row = byKey.get(n.id)!;
                  if (row.template_key !== current.key) {
                    return <tr key={n.id} className="inactive"><td className="mono">{n.number}</td><td><span className={`indent-${Math.min(n.depth, 4)}`}>{n.name}</span> <span className="badge">from base</span></td><td /><td /><td /></tr>;
                  }
                  return <TemplateRow key={n.id} id={row.id} number={row.number} name={row.name} depth={n.depth} isSystem={row.is_system} subtype={row.subtype} line={lineName(row.report_line_key)} />;
                }),
              ];
            })}
          </tbody>
        </table></div>
      </section>

      <details className="card">
        <summary><strong>Add an account to {current.name}</strong></summary>
        <ActionForm action={addTemplateAccount} submitLabel="Add to template">
          <input type="hidden" name="template_key" value={current.key} />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div><label>Number</label><input type="text" name="number" maxLength={16} /></div>
            <div><label>Name</label><input type="text" name="name" required /></div>
            <div><label>Type</label>
              <select name="subtype" defaultValue="expense">{TYPE_ORDER.map((ty) => <optgroup key={ty} label={TYPE_LABEL[ty]}>{SUBTYPES[ty].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}</select></div>
            <div><label>Parent</label>
              <select name="parent_key" defaultValue=""><option value="">(top level)</option>{parentChoices.map((p) => <option key={p.id} value={p.id}>{'– '.repeat(p.depth)}{accountLabel(p)}</option>)}</select></div>
            <div><label>Report line</label>
              <select name="report_line_key" defaultValue="office_general">{(lines ?? []).map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}</select></div>
          </div>
        </ActionForm>
      </details>
    </>
  );
}
