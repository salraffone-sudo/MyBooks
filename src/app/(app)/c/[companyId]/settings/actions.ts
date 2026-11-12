'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { done, fail, friendly, type ActionState } from '@/lib/result';
import { requireOwner, requireViewer, viewerCan } from '@/lib/viewer';

const uuid = z.string().uuid();

const details = z.object({
  company_id: uuid,
  legal_name: z.string().trim().min(1, 'Legal name is required.').max(200),
  display_name: z.string().trim().min(1, 'Short name is required.').max(80),
  basis: z.enum(['cash', 'accrual']),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
});

export async function saveDetails(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = details.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { company_id, ...patch } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('companies').update(patch).eq('id', company_id);
  if (error) return fail(error.code === '23505' ? 'Another company already uses that short name.' : friendly(error));
  revalidatePath('/', 'layout');
  return done('Saved.');
}

export async function saveLockDate(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ company_id: uuid, lock_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Enter a valid date or leave it empty to unlock.');
  const viewer = await requireViewer();
  if (!viewerCan(viewer, parsed.data.company_id, 'lock_date.set')) return fail('You do not have permission to set the lock date.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_lock_date', { p_company: parsed.data.company_id, p_date: parsed.data.lock_date || null });
  if (error) return fail(friendly(error));
  revalidatePath(`/c/${parsed.data.company_id}/settings`);
  return done(parsed.data.lock_date ? `Books are locked through ${parsed.data.lock_date}.` : 'Lock date cleared.');
}

export async function applyModule(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ company_id: uuid, module: z.enum(['service_business', 'real_estate', 'holding_company']) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Choose a module.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('apply_templates_to_company', { p_company: parsed.data.company_id, p_modules: [parsed.data.module] });
  if (error) return fail(friendly(error));
  revalidatePath(`/c/${parsed.data.company_id}`, 'layout');
  return done(data === 0 ? 'Nothing to add. This company already has every account from that module.' : `Added ${data} account${data === 1 ? '' : 's'}.`);
}

export async function setArchived(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ company_id: uuid, archive: z.enum(['yes', 'no']) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Invalid request.');
  const supabase = await createClient();
  const { error } = await supabase.from('companies').update({ archived_at: parsed.data.archive === 'yes' ? new Date().toISOString() : null }).eq('id', parsed.data.company_id);
  if (error) return fail(friendly(error));
  revalidatePath('/', 'layout');
  return done(parsed.data.archive === 'yes' ? 'Archived. It no longer appears in the switcher.' : 'Restored.');
}
