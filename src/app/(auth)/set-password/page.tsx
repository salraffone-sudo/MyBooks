import { ActionForm } from '@/components/Form';
import { setPassword } from './actions';

export const metadata = { title: 'Set password' };

export default function SetPasswordPage() {
  return (
    <>
      <h1>Choose a password</h1>
      <p className="muted small">At least 12 characters. A passphrase works well. You will set up your authenticator next.</p>
      <ActionForm action={setPassword} submitLabel="Save password">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </ActionForm>
    </>
  );
}
