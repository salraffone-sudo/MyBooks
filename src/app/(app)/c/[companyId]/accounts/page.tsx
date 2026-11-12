import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/Form';
import { createClient } from '@/lib/supabase/server';
import { requireViewer, viewerCan } from '@/lib/viewer';
import { SUBTYPES, TYPE_LABEL, TYPE_ORDER, buildTree, descendantIds, flatten, accountLabel, suggestNumber, type Account, type AccountType } from '@/lib/accounts';
import AccountRow from './AccountRow';
import { createAccount } from './actions';

export const metadata = { title: 'Chart of accounts' };

const SECTIONS_FOR: Record<AccountType, string[]> = {
  asset: ['asset'], liability: ['liability'], equity: ['equity'], income: ['income', 'other'], expense: ['direct_cost', 'expense', 'other'],
};

export default async function AccountsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const viewer = await requireViewer();
  if (!viewer.companies.some((c) => c.id === companyId)) notFound();
  const canEdit = viewerCan(viewer, companyId, 'coa.edit');

  const supabase = await createClient();
  const [{ data: accounts }, { data: lines }] = await Promise.all([
    supabase.from('accounts').select('*').eq('company_id', companyId),
    supabase.from('report_lines').select('key, name, section, sort_order').order('sort_order'),
  ]);
  const all = (accounts ?? []) as Account[];
  const reportLines = lines ?? [];
  const subtypeLabel = (s: string) => Object.values(SUBTYPES).flat().find((x) => x.key === s)?.label ?? s;

  return (
    <>
      {canEdit && (
        <details className="card">
          <summary><strong>Add an account</strong></summary>
          <ActionForm action={createAccount} submitLabel="Add account">
            <input type="hidden" name="company_id" value={companyId} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              <div><label htmlFor="a-number">Number</label><input id="a-number" type="text" name="number" maxLength={16} placeholder={`e.g. ${suggestNumber(all, 'expense')}`} /></div>
              <div><label htmlFor="a-name">Name</label><input id="a-name" type="text" name="name" required /></div>
              <div>
                <label htmlFor="a-subtype">Type</label>
                <select id="a-subtype" name="subtype" defaultValue="expense">
                  {TYPE_ORDER.map((t) => <optgroup key={t} label={TYPE_LABEL[t]}>{SUBTYPES[t].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
                </select>
              </div>
              <div>
                <label htmlFor="a-parent">Parent (same type)</label>
                <select id="a-parent" name="parent_id" defaultValue="">
                  <option value="">(top level)</option>
                  {TYPE_ORDER.map((t) => <optgroup key={t} label={TYPE_LABEL[t]}>{flatten(buildTree(all, t)).map((n) => <option key={n.id} value={n.id}>{'– '.repeat(n.depth)}{accountLabel(n)}</option>)}</optgroup>)}
                </select>
              </div>
              <div>
                <label htmlFor="a-line">Report line</label>
                <select id="a-line" name="report_line_key" defaultValue="office_general">
                  {reportLines.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </ActionForm>
        </details>
      )}

      {!canEdit && <div className="notice small">You can view this chart but not edit it.</div>}

      {TYPE_ORDER.map((t) => {
        const tree = flatten(buildTree(all, t));
        if (!tree.length) return null;
        const lineOptions = reportLines.filter((r) => SECTIONS_FOR[t].includes(r.section)).map((r) => ({ key: r.key, name: r.name }));
        return (
          <section key={t} className="card">
            <h2 style={{ marginTop: 0 }}>{TYPE_LABEL[t]}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th style={{ width: 90 }}>No.</th><th>Name</th><th className="hide-sm">Type</th><th className="hide-sm">Report line</th><th /></tr></thead>
                <tbody>
                  {tree.map((n) => {
                    const blocked = descendantIds(all, n.id);
                    const parents = tree.filter((p) => !blocked.has(p.id)).map((p) => ({ id: p.id, label: `${'– '.repeat(p.depth)}${accountLabel(p)}` }));
                    return <AccountRow key={n.id} node={{ ...n, children: [] }} canEdit={canEdit} parents={parents} reportLines={lineOptions} subtypeLabel={subtypeLabel(n.subtype)} />;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
