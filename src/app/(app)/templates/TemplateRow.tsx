'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/Form';
import { deleteTemplateAccount, updateTemplateAccount } from './actions';

export default function TemplateRow({ id, number, name, depth, isSystem, subtype, line }: {
  id: string; number: string | null; name: string; depth: number; isSystem: boolean; subtype: string; line: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td className="mono nowrap">{number ?? ''}</td>
        <td><span className={`indent-${Math.min(depth, 4)}`}>{name}</span>{isSystem && <> <span className="badge">system</span></>}</td>
        <td className="hide-sm muted small">{subtype.replaceAll('_', ' ')}</td>
        <td className="hide-sm muted small">{line}</td>
        <td className="right"><button type="button" className="btn small" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button></td>
      </tr>
      {open && (
        <tr><td colSpan={5} style={{ background: 'var(--surface-2)' }}>
          <ActionForm action={updateTemplateAccount}>
            <input type="hidden" name="id" value={id} />
            <div className="row inline">
              <div><label>Number</label><input type="text" name="number" defaultValue={number ?? ''} maxLength={16} style={{ width: 120 }} /></div>
              <div style={{ flex: 1, minWidth: 200 }}><label>Name</label><input type="text" name="name" defaultValue={name} required style={{ width: '100%' }} /></div>
            </div>
          </ActionForm>
          {!isSystem && (
            <ActionForm action={deleteTemplateAccount} submitLabel="Remove from template" submitClass="btn small danger">
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          )}
        </td></tr>
      )}
    </>
  );
}
