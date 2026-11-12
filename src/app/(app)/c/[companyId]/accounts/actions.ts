'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { SUBTYPES, typeOfSubtype, validNumber } from '@/lib/accounts';
import { done, fail, friendly, type ActionState } from '@/lib/result';
import { requireViewer, viewerCan } from '@/lib/viewer';

const uuid = z.string().uuid();
const number = z.string().trim().transform((s) => (s === '' ? null : s)).refine((s) => s === null || validNumber(s), 'Numbers cannot contain spaces and must be 16 characters or fewer.');
const cashFlow = z.enum(['cash', 'operating', 'investing', 'financing']);

async function guard(companyId: string) {
  const viewer = await requireViewer();
  if (!viewerCan(viewer, companyId, 'coa.edit')) return null;
  return await createClient();
}

const createSchema = z.object({
  company_id: uuid,
  name: z.string().trim().min(1, 'Name is required.').max(120),
  number,
  subtype: z.string().refine((s) => typeOfSubtype(s) !== null, 'Choose an account type.'),
  parent_id: z.string().transform((s) => (s === '' ? null : s)).pipe(uuid.nullable()),
  report_line_key: z.string().min(1, 'Choose a report line.'),
});

export async function createAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await guard(v.company_id);
  if (!supabase) return fail('You do not have permission to edit this chart.');
  const type = typeOfSubtype(v.subtype)!;
  const flow = SUBTYPES[type].find((s) => s.key === v.subtype)!.cashFlow;
  const { error } = await supabase.from('accounts').insert({
    company_id: v.company_id, name: v.name, number: v.number, type, subtype: v.subtype,
    parent_id: v.parent_id, report_line_key: v.report_line_key, cash_flow_class: flow,
  });
  if (error) return fail(friendly(error));
  revalidatePath(`/c/${v.company_id}/accounts`);
  return done(`Added ${v.name}.`);
}

const updateSchema = z.object({
  id: uuid,
  company_id: uuid,
  name: z.string().trim().min(1, 'Name is required.').max(120),
  number,
  parent_id: z.string().transform((s) => (s === '' ? null : s)).pipe(uuid.nullable()),
  report_line_key: z.string().min(1),
  cash_flow_class: cashFlow,
  active: z.string().optional().transform((s) => s === 'on'),
});

export async function updateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { id, company_id, ...patch } = parsed.data;
  const supabase = await guard(company_id);
  if (!supabase) return fail('You do not have permission to edit this chart.');
  const { data, error } = await supabase.from('accounts').update(patch).eq('id', id).eq('company_id', company_id).select('id');
  if (error) return fail(friendly(error));
  if (!data?.length) return fail('Nothing was changed. The account may no longer exist.');
  revalidatePath(`/c/${company_id}/accounts`);
  return done('Saved.');
}

export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: uuid, company_id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Invalid request.');
  const supabase = await guard(parsed.data.company_id);
  if (!supabase) return fail('You do not have permission to edit this chart.');
  const { data, error } = await supabase.from('accounts').delete().eq('id', parsed.data.id).eq('company_id', parsed.data.company_id).select('id');
  if (error) {
    if (error.code === '23503') return fail('This account has child accounts. Move or delete them first.');
    return fail(friendly(error));
  }
  if (!data?.length) return fail('This account cannot be deleted (system accounts and accounts with activity are kept). Deactivate it instead.');
  revalidatePath(`/c/${parsed.data.company_id}/accounts`);
  return done('Deleted.');
}
