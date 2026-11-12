'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/Form';
import { type AccountNode } from '@/lib/accounts';
import { deleteAccount, updateAccount } from './actions';

export type ParentOption = { id: string; label: string };
export type ReportLineOption = { key: string; name: string };

const FLOW = ['cash', 'operating', 'investing', 'financing'];

export default function AccountRow({ node, canEdit, parents, reportLines: offered, subtypeLabel }: {
  node: AccountNode; canEdit: boolean; parents: ParentOption[]; reportLines: ReportLineOption[]; subtypeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // Keep the account's current report line selectable even if it is outside the usual section.
  const reportLines = offered.some((r) => r.key === node.report_line_key) ? offered : [{ key: node.report_line_key, name: node.report_line_key }, ...offered];
  const lineName = reportLines.find((r) => r.key === node.report_line_key)?.name ?? node.report_line_key;
  return (
    <>
      <tr className={node.active ? '' : 'inactive'}>
        <td className="nowrap mono">{node.number ?? ''}</td>
        <td><span className={`indent-${Math.min(node.depth, 4)}`}>{node.name}</span>{node.is_system && <> <span className="badge">system</span></>}{!node.active && <> <span className="badge">inactive</span></>}</td>
        <td className="hide-sm muted small">{subtypeLabel}</td>
        <td className="hide-sm muted small">{lineName}</td>
        <td className="right">{canEdit && <button type="button" className="btn small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Edit'}</button>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
            <ActionForm action={updateAccount} submitLabel="Save changes">
              <input type="hidden" name="id" value={node.id} />
              <input type="hidden" name="company_id" value={node.company_id} />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                <div><label>Number</label><input type="text" name="number" defaultValue={node.number ?? ''} maxLength={16} placeholder="optional" /></div>
                <div><label>Name</label><input type="text" name="name" defaultValue={node.name} required /></div>
                <div>
                  <label>Parent</label>
                  <select name="parent_id" defaultValue={node.parent_id ?? ''}>
                    <option value="">(top level)</option>
                    {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label>Report line</label>
                  <select name="report_line_key" defaultValue={node.report_line_key}>
                    {reportLines.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Cash-flow class</label>
                  <select name="cash_flow_class" defaultValue={node.cash_flow_class}>{FLOW.map((f) => <option key={f}>{f}</option>)}</select>
                </div>
                <div>
                  <label>Status</label>
                  {node.is_system
                    ? <><input type="hidden" name="active" value="on" /><span className="muted small">System accounts stay active.</span></>
                    : <label style={{ fontWeight: 400 }}><input type="checkbox" name="active" defaultChecked={node.active} /> Active</label>}
                </div>
              </div>
            </ActionForm>
            {!node.is_system && (
              <ActionForm action={deleteAccount} submitLabel="Delete account" submitClass="btn small danger">
                <input type="hidden" name="id" value={node.id} />
                <input type="hidden" name="company_id" value={node.company_id} />
                <span className="muted small">Only accounts with no activity and no child accounts can be deleted. Otherwise mark it inactive.</span>
              </ActionForm>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
