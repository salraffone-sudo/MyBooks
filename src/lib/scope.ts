import 'server-only';
import { cookies } from 'next/headers';

export const SCOPE_COOKIE = 'mb_scope';

/** The company id last chosen in the switcher, or 'all'. */
export async function getScope(): Promise<string> {
  return (await cookies()).get(SCOPE_COOKIE)?.value ?? 'all';
}
