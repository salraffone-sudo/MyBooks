// Capabilities are the real permission unit. Presets are only starting points / labels.
// Keep this list in sync with public.known_capabilities() in the database.
export const CAPABILITIES = [
  { key: 'reports.view', label: 'View reports and registers' },
  { key: 'invoices.write', label: 'Create and edit invoices and customers' },
  { key: 'bills.write', label: 'Enter bills, record payments, edit vendors' },
  { key: 'journal.post', label: 'Post journal entries' },
  { key: 'reconcile', label: 'Reconcile accounts' },
  { key: 'coa.edit', label: 'Edit the chart of accounts' },
  { key: 'lock_date.set', label: 'Set the period lock date' },
  { key: 'import.all', label: 'Import CSV and PDF files of any kind' },
  { key: 'import.documents', label: 'Import invoices and bills only' },
  { key: 'tin.reveal', label: 'Reveal full taxpayer IDs and W-9s (logged)' },
] as const;

export type Capability = (typeof CAPABILITIES)[number]['key'];
export const CAPABILITY_KEYS: readonly string[] = CAPABILITIES.map((c) => c.key);

export type Preset = 'accountant' | 'operator' | 'viewer' | 'custom';

export const PRESETS: Record<Exclude<Preset, 'custom'>, { label: string; capabilities: Capability[] }> = {
  accountant: {
    label: 'Accountant',
    capabilities: ['reports.view', 'journal.post', 'reconcile', 'coa.edit', 'lock_date.set', 'import.all', 'bills.write', 'invoices.write'],
  },
  operator: {
    label: 'Operator',
    capabilities: ['reports.view', 'invoices.write', 'bills.write', 'import.documents'],
  },
  viewer: { label: 'Viewer', capabilities: ['reports.view'] },
};

export function isCapability(x: string): x is Capability {
  return CAPABILITY_KEYS.includes(x);
}

/** Drop unknowns, de-duplicate, and keep the canonical order. */
export function normalizeCapabilities(input: readonly string[]): Capability[] {
  const wanted = new Set(input);
  return CAPABILITIES.map((c) => c.key).filter((k) => wanted.has(k));
}

/** The label that best describes an effective capability set. */
export function presetFor(caps: readonly string[]): Preset {
  const n = normalizeCapabilities(caps);
  for (const [name, p] of Object.entries(PRESETS)) {
    const target = normalizeCapabilities(p.capabilities);
    if (target.length === n.length && target.every((c, i) => c === n[i])) return name as Preset;
  }
  return 'custom';
}

/** A membership grants access today unless it has ended. Dates are ISO yyyy-mm-dd. */
export function membershipActive(endDate: string | null | undefined, today: string): boolean {
  return !endDate || endDate >= today;
}

export function can(
  viewer: { isOwner: boolean; memberships: { companyId: string; capabilities: string[]; endDate: string | null }[] },
  companyId: string,
  capability: Capability,
  today: string,
): boolean {
  if (viewer.isOwner) return true;
  const m = viewer.memberships.find((x) => x.companyId === companyId);
  return !!m && membershipActive(m.endDate, today) && m.capabilities.includes(capability);
}
