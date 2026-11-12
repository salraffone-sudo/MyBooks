import Link from 'next/link';
import { ActionForm } from '@/components/Form';
import { sendReset } from './actions';

export const metadata = { title: 'Reset password' };

export default function ForgotPage() {
  return (
    <>
      <h1>Reset your password</h1>
      <ActionForm action={sendReset} submitLabel="Send reset link">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </ActionForm>
      <p className="small" style={{ marginTop: 12 }}><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
