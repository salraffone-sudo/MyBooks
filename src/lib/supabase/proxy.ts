import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths reachable without a session.
const PUBLIC = ['/login', '/forgot', '/auth/confirm', '/manifest.webmanifest', '/icon.svg', '/icons', '/offline'];
// Paths reachable with a session that has not yet passed MFA.
const PRE_MFA = ['/mfa', '/set-password', '/auth/signout'];

const isUnder = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + '/'));

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const path = request.nextUrl.pathname;
  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    const r = NextResponse.redirect(url);
    // Keep any refreshed session cookies on the redirect.
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  // getUser() validates the token with Supabase; never trust getSession() here.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return isUnder(path, PUBLIC) ? response : redirect('/login');
  if (isUnder(path, PUBLIC) && path !== '/auth/confirm') return redirect('/');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    const target = aal?.nextLevel === 'aal2' ? '/mfa/verify' : '/mfa/enroll';
    return isUnder(path, PRE_MFA) && (path.startsWith(target) || path.startsWith('/set-password') || path.startsWith('/auth/signout'))
      ? response
      : redirect(target);
  }
  // Fully authenticated: the MFA pages are no longer needed.
  if (path.startsWith('/mfa')) return redirect('/');
  return response;
}
