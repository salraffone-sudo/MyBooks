'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizeCapabilities, presetFor } from '@/lib/capabilities';
import { env } from '@/lib/env';
import { done, fail, friendly, type ActionState } from '@/lib/result';
import { requireOwner } from '@/lib/viewer';

const uuid = z.string().uuid();

export async function inviteUser(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email.'), display_name: z.string().trim().max(80).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.display_name || undefined },
    redirectTo: `${env.siteUrl()}/auth/confirm`,
  });
  if (error) return fail(error.message);
  revalidatePath('/users');
  return done(`Invitation sent to ${parsed.data.email}. They have no access until you grant it below.`);
}

const membership = z.object({
  company_id: uuid,
  user_id: uuid,
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).transform((s) => s || null),
});

export async function saveMembership(_: ActionState, formData: FormData): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = membership.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Check the company, user and end date.');
  if (parsed.data.user_id === owner.id) return fail('The owner has access to everything and needs no role.');
  const capabilities = normalizeCapabilities(formData.getAll('capabilities').map(String));
  if (capabilities.length === 0) return fail('Pick at least one capability, or remove the access instead.');
  const supabase = await createClient();
  const { error } = await supabase.from('memberships').upsert(
    { company_id: parsed.data.company_id, user_id: parsed.data.user_id, preset: presetFor(capabilities), capabilities, end_date: parsed.data.end_date, created_by: owner.id },
    { onConflict: 'company_id,user_id' },
  );
  if (error) return fail(friendly(error));
  revalidatePath('/users');
  return done('Access saved.');
}

export async function removeMembership(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = z.object({ id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Invalid request.');
  const supabase = await createClient();
  const { error } = await supabase.from('memberships').delete().eq('id', parsed.data.id);
  if (error) return fail(friendly(error));
  revalidatePath('/users');
  return done('Access removed.');
}

export async function removeUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = z.object({ user_id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Invalid request.');
  if (parsed.data.user_id === owner.id) return fail('You cannot remove the owner.');
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(parsed.data.user_id);
  if (error) return fail(error.message);
  revalidatePath('/users');
  return done('User removed. Their history stays in the audit log.');
}
