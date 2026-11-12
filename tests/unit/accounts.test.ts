import { describe, expect, it } from 'vitest';
import { type Account, buildTree, compareNumbers, descendantIds, flatten, nextFreeNumber, suggestNumber, typeOfSubtype, validNumber, SUBTYPES, TYPE_ORDER } from '@/lib/accounts';

const acct = (id: string, number: string | null, name: string, parent: string | null = null, type: Account['type'] = 'expense'): Account => ({
  id, company_id: 'c', number, name, type, subtype: 'expense', parent_id: parent, report_line_key: 'x', cash_flow_class: 'operating', active: true, is_system: false,
});

describe('account helpers', () => {
  it('sorts numbers numerically, with missing numbers last', () => {
    expect(['2000', '1010', null, '1100', '900'].sort(compareNumbers)).toEqual(['900', '1010', '1100', '2000', null]);
  });
  it('builds a nested tree with depths', () => {
    const t = buildTree([acct('b', '6210', 'Accounting', 'a'), acct('a', '6200', 'Professional fees'), acct('c', '6000', 'Advertising')]);
    expect(flatten(t).map((n) => [n.name, n.depth])).toEqual([['Advertising', 0], ['Professional fees', 0], ['Accounting', 1]]);
  });
  it('treats a child whose parent is absent as a root', () => {
    expect(buildTree([acct('b', '1', 'Child', 'missing')])).toHaveLength(1);
  });
  it('filters by type', () => {
    expect(buildTree([acct('a', '1', 'A', null, 'asset'), acct('b', '2', 'B')], 'asset').map((n) => n.name)).toEqual(['A']);
  });
  it('descendantIds includes the node and all its descendants only', () => {
    const l = [acct('a', '1', 'A'), acct('b', '2', 'B', 'a'), acct('c', '3', 'C', 'b'), acct('d', '4', 'D')];
    expect([...descendantIds(l, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });
  it('validates numbers like the database does', () => {
    expect(validNumber('1010')).toBe(true);
    expect(validNumber('X-7')).toBe(true);
    expect(validNumber('has space')).toBe(false);
    expect(validNumber('')).toBe(false);
    expect(validNumber('12345678901234567')).toBe(false);
  });
  it('suggests the next free number in the type range', () => {
    expect(nextFreeNumber(['1010', '1020', null], 1010)).toBe('1030');
    expect(suggestNumber([acct('a', '6010', 'x')], 'expense')).toBe('5010');
    expect(suggestNumber([], 'asset')).toBe('1010');
  });
  it('every subtype maps back to its type', () => {
    for (const t of TYPE_ORDER) for (const s of SUBTYPES[t]) expect(typeOfSubtype(s.key)).toBe(t);
  });
});
