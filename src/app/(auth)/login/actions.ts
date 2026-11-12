'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, type ActionState } from '@/lib/result';

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Enter your email and password.');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for every failure so the form does not reveal which emails exist.
  if (error) return fail('Email or password is incorrect.');
  redirect('/');
}
