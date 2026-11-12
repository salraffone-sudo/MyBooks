import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** Service-role client. Bypasses RLS: use only after confirming the caller is the owner. */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
