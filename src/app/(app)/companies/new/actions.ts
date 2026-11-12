'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, friendly, type ActionState } from '@/lib/result';
import { requireOwner } from '@/lib/viewer';

const schema = z.object({
  legal_name: z.string().trim().min(1, 'Legal name is required.').max(200),
  display_name: z.string().trim().min(1, 'Short name is required.').max(80),
  kind: z.enum(['business', 'personal']),
  basis: z.enum(['cash', 'accrual']),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  modules: z.array(z.enum(['service_business', 'real_estate', 'holding_company'])).default([]),
});

export async function createCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = schema.safeParse({ ...Object.fromEntries(formData), modules: formData.getAll('modules') });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_company_from_template', {
    p_legal_name: v.legal_name,
    p_display_name: v.display_name,
    p_kind: v.kind,
    p_basis: v.basis,
    p_fiscal_year_start_month: v.fiscal_year_start_month,
    p_modules: v.kind === 'personal' ? [] : v.modules,
  });
  if (error) return fail(friendly(error));
  redirect(`/c/${data}/accounts`);
}
