'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { done, fail, type ActionState } from '@/lib/result';

export async function sendReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Enter a valid email.');
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Same answer whether or not the account exists.
  return done('If that email has an account, a reset link is on its way.');
}
