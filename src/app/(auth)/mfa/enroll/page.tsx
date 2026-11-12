'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function EnrollMfa() {
  const router = useRouter();
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Remove abandoned, unverified factors so enrollment can be retried.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' });
      if (cancelled) return;
      if (error || !data) { setError(error?.message ?? 'Could not start enrollment.'); return; }
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => { cancelled = true; };
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factor) return;
    setBusy(true); setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) { setError('That code did not match. Try the current code.'); setBusy(false); return; }
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <h1>Set up two-step sign-in</h1>
      <p className="muted small">Scan this with an authenticator app (1Password, Google Authenticator, Authy), then enter the 6-digit code. This is required for every account.</p>
      {factor ? (
        <>
          <div className="qr"><img src={factor.qr} alt="QR code for your authenticator app" /></div>
          <p className="small muted" style={{ marginTop: 8 }}>Or enter this key manually:<br /><code>{factor.secret}</code></p>
          <form onSubmit={verify}>
            <label htmlFor="code">6-digit code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} type="text" />
            <button className="btn primary" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Checking…' : 'Verify and continue'}</button>
          </form>
        </>
      ) : !error && <p className="muted">Preparing…</p>}
      {error && <div role="alert" className="msg err">{error}</div>}
      <form action="/auth/signout" method="post" style={{ marginTop: 16 }}><button className="btn small">Sign out</button></form>
    </>
  );
}
