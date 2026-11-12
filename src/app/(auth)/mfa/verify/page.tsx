'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function VerifyMfa() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const supabase = createClient();
    const { data: list } = await supabase.auth.mfa.listFactors();
    const factor = list?.totp?.[0];
    if (!factor) { router.replace('/mfa/enroll'); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) { setError('That code did not match. Try the current code.'); setBusy(false); setCode(''); return; }
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <h1>Enter your code</h1>
      <p className="muted small">Open your authenticator app and enter the current 6-digit code.</p>
      <form onSubmit={verify}>
        <label htmlFor="code">6-digit code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} type="text" />
        <button className="btn primary" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Checking…' : 'Verify'}</button>
      </form>
      {error && <div role="alert" className="msg err">{error}</div>}
      <form action="/auth/signout" method="post" style={{ marginTop: 16 }}><button className="btn small">Sign out</button></form>
    </>
  );
}
