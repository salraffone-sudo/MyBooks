import Link from 'next/link';
import { ActionForm } from '@/components/Form';
import { signIn } from './actions';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      {error === 'link' && <div role="alert" className="msg err">That link has expired or was already used. Ask the owner to send a new invitation, or reset your password.</div>}
      <p className="muted small">Access is by invitation. After your password you will be asked for your authenticator code.</p>
      <ActionForm action={signIn} submitLabel="Sign in">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
      <p className="small" style={{ marginTop: 12 }}><Link href="/forgot">Forgot your password?</Link></p>
    </>
  );
}
