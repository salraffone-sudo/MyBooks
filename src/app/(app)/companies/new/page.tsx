import { ActionForm } from '@/components/Form';
import { createClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/viewer';
import { createCompany } from './actions';

export const metadata = { title: 'New company' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function NewCompany() {
  const viewer = await requireOwner();
  const supabase = await createClient();
  const { data: templates } = await supabase.from('account_templates').select('key, name, description, scope').eq('scope', 'module').order('sort_order');
  const hasPersonal = viewer.companies.some((c) => c.kind === 'personal');

  return (
    <>
      <h1>New company</h1>
      <p className="muted">The chart of accounts starts from the base template plus any modules you tick. You can edit every account afterwards.</p>
      <div className="card" style={{ maxWidth: 560 }}>
        <ActionForm action={createCompany} submitLabel="Create company">
          <label htmlFor="legal_name">Legal name</label>
          <input id="legal_name" name="legal_name" type="text" required placeholder="TRG 45 Barbara LLC" />
          <label htmlFor="display_name">Short name</label>
          <input id="display_name" name="display_name" type="text" required placeholder="45 Barbara" />
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" defaultValue="business">
            <option value="business">Business</option>
            {!hasPersonal && <option value="personal">Personal books (owner only)</option>}
          </select>
          <label htmlFor="basis">Basis</label>
          <select id="basis" name="basis" defaultValue="accrual">
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
          <label htmlFor="fy">Fiscal year starts</label>
          <select id="fy" name="fiscal_year_start_month" defaultValue="1">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <fieldset style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
            <legend style={{ fontSize: 13, fontWeight: 600 }}>Modules (businesses only)</legend>
            <div className="checks" style={{ gridTemplateColumns: '1fr' }}>
              {(templates ?? []).map((t) => (
                <label key={t.key}><input type="checkbox" name="modules" value={t.key} /> <span><strong>{t.name}</strong><br /><span className="muted small">{t.description}</span></span></label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </div>
    </>
  );
}
