import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/Form';
import { requireViewer, viewerCan } from '@/lib/viewer';
import { applyModule, saveDetails, saveLockDate, setArchived } from './actions';

export const metadata = { title: 'Company settings' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MODULES = [
  { key: 'service_business', name: 'Service business' },
  { key: 'real_estate', name: 'Real estate' },
  { key: 'holding_company', name: 'Holding company' },
];

export default async function SettingsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const viewer = await requireViewer();
  const c = viewer.companies.find((x) => x.id === companyId);
  if (!c) notFound();
  const canLock = viewerCan(viewer, companyId, 'lock_date.set');
  const missing = MODULES.filter((m) => !c.template_keys.includes(m.key));

  return (
    <>
      <section className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Details</h2>
        {viewer.isOwner ? (
          <ActionForm action={saveDetails}>
            <input type="hidden" name="company_id" value={c.id} />
            <label htmlFor="legal_name">Legal name</label>
            <input id="legal_name" name="legal_name" type="text" defaultValue={c.legal_name} required />
            <label htmlFor="display_name">Short name</label>
            <input id="display_name" name="display_name" type="text" defaultValue={c.display_name} required />
            <label htmlFor="basis">Basis</label>
            <select id="basis" name="basis" defaultValue={c.basis}><option value="accrual">Accrual</option><option value="cash">Cash</option></select>
            <label htmlFor="fy">Fiscal year starts</label>
            <select id="fy" name="fiscal_year_start_month" defaultValue={c.fiscal_year_start_month}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </ActionForm>
        ) : (
          <p className="muted">Only the owner can change company details.</p>
        )}
      </section>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Period lock</h2>
        <p className="muted small">Entries dated on or before the lock date cannot be added or changed. Enforced from Phase 2 when the ledger arrives.</p>
        {canLock ? (
          <ActionForm action={saveLockDate}>
            <input type="hidden" name="company_id" value={c.id} />
            <label htmlFor="lock_date">Locked through</label>
            <input id="lock_date" name="lock_date" type="date" defaultValue={c.lock_date ?? ''} />
          </ActionForm>
        ) : (
          <p>{c.lock_date ? `Locked through ${c.lock_date}.` : 'Not locked.'}</p>
        )}
      </section>

      {viewer.isOwner && c.kind === 'business' && (
        <section className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Template modules</h2>
          <p className="muted small">Applied: {['business_base', ...c.template_keys.filter((k) => k !== 'business_base')].join(', ')}. Adding a module only adds accounts this company lacks. It never changes or removes existing accounts.</p>
          {missing.length > 0 ? (
            <ActionForm action={applyModule} submitLabel="Add module accounts">
              <input type="hidden" name="company_id" value={c.id} />
              <label htmlFor="module">Module</label>
              <select id="module" name="module">{missing.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select>
            </ActionForm>
          ) : <p className="small">Every module is already applied.</p>}
        </section>
      )}

      {viewer.isOwner && (
        <section className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>{c.archived_at ? 'Restore' : 'Archive'}</h2>
          <p className="muted small">Archived companies are hidden from the switcher and dashboard. Nothing is deleted.</p>
          <ActionForm action={setArchived} submitLabel={c.archived_at ? 'Restore company' : 'Archive company'} submitClass="btn">
            <input type="hidden" name="company_id" value={c.id} />
            <input type="hidden" name="archive" value={c.archived_at ? 'no' : 'yes'} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
