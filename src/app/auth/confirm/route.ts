import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'email', 'email_change'];

// Invite and recovery emails link here with ?token_hash=...&type=invite|recovery
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  // Only same-site relative redirects.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/set-password';

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(target, request.url));
  }
  const url = new URL('/login', request.url);
  url.searchParams.set('error', 'link');
  return NextResponse.redirect(url);
}
