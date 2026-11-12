import { ActionForm } from '@/components/Form';
import CapabilityPicker from '@/components/CapabilityPicker';
import { createClient } from '@/lib/supabase/server';
import { PRESETS, presetFor } from '@/lib/capabilities';
import { requireOwner } from '@/lib/viewer';
import { inviteUser, removeMembership, removeUser, saveMembership } from './actions';

export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const viewer = await requireOwner();
  const supabase = await createClient();
  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name, is_owner, created_at').order('email'),
    supabase.from('memberships').select('id, company_id, user_id, preset, capabilities, end_date'),
  ]);
  const grantable = viewer.companies.filter((c) => c.kind === 'business' && !c.archived_at);
  const nameOf = (id: string) => viewer.companies.find((c) => c.id === id)?.display_name ?? 'Unknown company';
  const labelOf = (p: string) => (p === 'custom' ? 'Custom' : PRESETS[p as keyof typeof PRESETS]?.label ?? p);

  return (
    <>
      <h1>Users</h1>
      <p className="muted">Only you can invite people or change what they can do. The personal books are never shared.</p>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Invite someone</h2>
        <ActionForm action={inviteUser} submitLabel="Send invitation">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
          <label htmlFor="display_name">Name (optional)</label>
          <input id="display_name" name="display_name" type="text" />
        </ActionForm>
      </section>

      {(profiles ?? []).map((p) => {
        const mine = (memberships ?? []).filter((m) => m.user_id === p.id);
        return (
          <section key={p.id} className="card">
            <div className="row spread">
              <div><strong>{p.display_name || p.email}</strong> {p.is_owner && <span className="badge green">Owner</span>}<div className="muted small">{p.email}</div></div>
              {!p.is_owner && (
                <ActionForm action={removeUser} submitLabel="Remove user" submitClass="btn small danger">
                  <input type="hidden" name="user_id" value={p.id} />
                </ActionForm>
              )}
            </div>

            {p.is_owner ? <p className="muted small" style={{ marginTop: 8 }}>Has access to every company, the personal books, users, templates and the audit log.</p> : (
              <>
                {mine.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>No access to any company yet.</p>}
                {mine.map((m) => (
                  <details key={m.id} style={{ marginTop: 10 }}>
                    <summary>
                      <strong>{nameOf(m.company_id)}</strong> · {labelOf(presetFor(m.capabilities))}
                      {m.end_date && <span className="muted small"> · ends {m.end_date}</span>}
                    </summary>
                    <ActionForm action={saveMembership} submitLabel="Save access">
                      <input type="hidden" name="company_id" value={m.company_id} />
                      <input type="hidden" name="user_id" value={p.id} />
                      <CapabilityPicker initial={m.capabilities} />
                      <label>Access ends (optional)</label>
                      <input type="date" name="end_date" defaultValue={m.end_date ?? ''} style={{ maxWidth: 200 }} />
                    </ActionForm>
                    <ActionForm action={removeMembership} submitLabel="Remove access to this company" submitClass="btn small danger">
                      <input type="hidden" name="id" value={m.id} />
                    </ActionForm>
                  </details>
                ))}
                {grantable.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary>Grant access to a company</summary>
                    <ActionForm action={saveMembership} submitLabel="Grant access">
                      <input type="hidden" name="user_id" value={p.id} />
                      <label>Company</label>
                      <select name="company_id" style={{ maxWidth: 260 }}>{grantable.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select>
                      <CapabilityPicker />
                      <label>Access ends (optional)</label>
                      <input type="date" name="end_date" style={{ maxWidth: 200 }} />
                    </ActionForm>
                  </details>
                )}
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
