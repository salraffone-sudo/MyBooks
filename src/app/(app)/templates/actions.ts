'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { typeOfSubtype, validNumber } from '@/lib/accounts';
import { done, fail, friendly, type ActionState } from '@/lib/result';
import { requireOwner } from '@/lib/viewer';

const number = z.string().trim().transform((s) => (s === '' ? null : s)).refine((s) => s === null || validNumber(s), 'Numbers cannot contain spaces and must be 16 characters or fewer.');

export async function updateTemplateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1, 'Name is required.').max(120), number }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from('template_accounts').update({ name: parsed.data.name, number: parsed.data.number }).eq('id', parsed.data.id);
  if (error) return fail(friendly(error));
  revalidatePath('/templates');
  return done('Saved. Existing companies are not changed.');
}

export async function addTemplateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({
    template_key: z.string().min(1),
    name: z.string().trim().min(1, 'Name is required.').max(120),
    number,
    subtype: z.string().refine((s) => typeOfSubtype(s) !== null, 'Choose an account type.'),
    parent_key: z.string().transform((s) => s || null),
    report_line_key: z.string().min(1, 'Choose a report line.'),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: last } = await supabase.from('template_accounts').select('sort_order').eq('template_key', v.template_key).order('sort_order', { ascending: false }).limit(1);
  const { error } = await supabase.from('template_accounts').insert({
    template_key: v.template_key, key: `${v.template_key}.custom.${randomBytes(4).toString('hex')}`,
    number: v.number, name: v.name, type: typeOfSubtype(v.subtype)!, subtype: v.subtype,
    parent_key: v.parent_key, report_line_key: v.report_line_key, sort_order: (last?.[0]?.sort_order ?? 0) + 10,
  });
  if (error) return fail(friendly(error));
  revalidatePath('/templates');
  return done('Added to the template. Use “Add module accounts” on a company to bring it in.');
}

export async function deleteTemplateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Invalid request.');
  const supabase = await createClient();
  const { data, error } = await supabase.from('template_accounts').delete().eq('id', parsed.data.id).eq('is_system', false).select('id');
  if (error) return fail(friendly(error));
  if (!data?.length) return fail('System accounts cannot be removed from a template.');
  revalidatePath('/templates');
  return done('Removed from the template. Existing companies are not changed.');
}
