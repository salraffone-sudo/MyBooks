'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, type ActionState } from '@/lib/result';

const schema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: 'The two passwords do not match.', path: ['confirm'] });

export async function setPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.message);
  redirect('/');
}
