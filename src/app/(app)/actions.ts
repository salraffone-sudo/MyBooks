'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SCOPE_COOKIE } from '@/lib/scope';
import { requireViewer } from '@/lib/viewer';

/** Remember the chosen company (or 'all') and go to its page. */
export async function setScope(value: string) {
  const viewer = await requireViewer();
  const valid = value === 'all' || viewer.companies.some((c) => c.id === value);
  const scope = valid ? value : 'all';
  (await cookies()).set(SCOPE_COOKIE, scope, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect(scope === 'all' ? '/' : `/c/${scope}/accounts`);
}
