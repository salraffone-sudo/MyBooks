'use client';
import { useActionState } from 'react';
import type { ActionState } from '@/lib/result';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the returned message. */
export function ActionForm({ action, children, className, submitLabel, submitClass = 'btn primary', hideSubmit }: {
  action: Action; children?: React.ReactNode; className?: string; submitLabel?: string; submitClass?: string; hideSubmit?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      {!hideSubmit && <button className={submitClass} disabled={pending} style={{ marginTop: 12 }}>{pending ? 'Working…' : submitLabel ?? 'Save'}</button>}
      {state && <div role="status" className={`msg ${state.ok ? 'ok' : 'err'}`}>{state.message}</div>}
    </form>
  );
}
