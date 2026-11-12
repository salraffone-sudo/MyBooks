import { describe, expect, it } from 'vitest';
import { CAPABILITY_KEYS, PRESETS, can, membershipActive, normalizeCapabilities, presetFor } from '@/lib/capabilities';

describe('capabilities', () => {
  it('presets only contain known capabilities', () => {
    for (const p of Object.values(PRESETS)) for (const c of p.capabilities) expect(CAPABILITY_KEYS).toContain(c);
  });
  it('normalizes: drops unknowns, dedupes, canonical order', () => {
    expect(normalizeCapabilities(['coa.edit', 'bogus', 'reports.view', 'coa.edit'])).toEqual(['reports.view', 'coa.edit']);
  });
  it('labels a capability set by its closest preset, else custom', () => {
    expect(presetFor(PRESETS.viewer.capabilities)).toBe('viewer');
    expect(presetFor([...PRESETS.operator.capabilities].reverse())).toBe('operator');
    expect(presetFor([...PRESETS.operator.capabilities, 'tin.reveal'])).toBe('custom');
  });
  it('memberships end on the day after their end date', () => {
    expect(membershipActive(null, '2026-11-12')).toBe(true);
    expect(membershipActive('2026-11-12', '2026-11-12')).toBe(true);
    expect(membershipActive('2026-11-11', '2026-11-12')).toBe(false);
  });
  it('can(): owner has everything; members only what they hold, in their companies, until the end date', () => {
    const v = { isOwner: false, memberships: [{ companyId: 'a', capabilities: ['coa.edit'], endDate: null }, { companyId: 'b', capabilities: ['coa.edit'], endDate: '2020-01-01' }] };
    expect(can(v, 'a', 'coa.edit', '2026-11-12')).toBe(true);
    expect(can(v, 'a', 'journal.post', '2026-11-12')).toBe(false);
    expect(can(v, 'b', 'coa.edit', '2026-11-12')).toBe(false);
    expect(can(v, 'c', 'coa.edit', '2026-11-12')).toBe(false);
    expect(can({ isOwner: true, memberships: [] }, 'zzz', 'tin.reveal', '2026-11-12')).toBe(true);
  });
});
