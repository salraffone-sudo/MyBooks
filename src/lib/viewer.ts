import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, type Capability } from '@/lib/capabilities';

export type CompanyRow = {
  id: string;
  legal_name: string;
  display_name: string;
  kind: 'business' | 'personal';
  basis: 'cash' | 'accrual';
  fiscal_year_start_month: number;
  lock_date: string | null;
  template_keys: string[];
  archived_at: string | null;
};

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  isOwner: boolean;
  companies: CompanyRow[];
  memberships: { companyId: string; capabilities: string[]; endDate: string | null }[];
};

export const today = () => new Date().toISOString().slice(0, 10);

/** Current signed-in viewer, or null. RLS decides which companies come back. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: companies }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('email, display_name, is_owner').eq('id', user.id).maybeSingle(),
    supabase.from('companies').select('*').order('display_name'),
    supabase.from('memberships').select('company_id, capabilities, end_date').eq('user_id', user.id),
  ]);
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    displayName: profile?.display_name ?? user.email ?? '',
    isOwner: !!profile?.is_owner,
    companies: (companies ?? []) as CompanyRow[],
    memberships: (memberships ?? []).map((m) => ({ companyId: m.company_id, capabilities: m.capabilities, endDate: m.end_date })),
  };
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect('/login');
  return v;
}

export async function requireOwner(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isOwner) redirect('/');
  return v;
}

export function viewerCan(v: Viewer, companyId: string, cap: Capability) {
  return can(v, companyId, cap, today());
}
