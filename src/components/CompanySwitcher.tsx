'use client';
import { useTransition } from 'react';
import { setScope } from '@/app/(app)/actions';

export default function CompanySwitcher({ companies, current }: { companies: { id: string; name: string }[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="row small" style={{ margin: 0, fontWeight: 400 }}>
      <span className="muted hide-sm">Company</span>
      <select
        aria-label="Company"
        value={current}
        disabled={pending}
        style={{ width: 'auto', maxWidth: 220 }}
        onChange={(e) => start(() => setScope(e.target.value))}
      >
        <option value="all">All companies</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}
