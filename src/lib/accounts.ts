export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type Account = {
  id: string;
  company_id: string;
  number: string | null;
  name: string;
  type: AccountType;
  subtype: string;
  parent_id: string | null;
  report_line_key: string;
  cash_flow_class: string;
  active: boolean;
  is_system: boolean;
};

export const SUBTYPES: Record<AccountType, { key: string; label: string; cashFlow: string }[]> = {
  asset: [
    { key: 'bank', label: 'Bank', cashFlow: 'cash' },
    { key: 'accounts_receivable', label: 'Accounts receivable', cashFlow: 'operating' },
    { key: 'other_current_asset', label: 'Other current asset', cashFlow: 'operating' },
    { key: 'fixed_asset', label: 'Fixed asset', cashFlow: 'investing' },
    { key: 'accumulated_depreciation', label: 'Accumulated depreciation', cashFlow: 'investing' },
    { key: 'other_asset', label: 'Other asset', cashFlow: 'investing' },
  ],
  liability: [
    { key: 'accounts_payable', label: 'Accounts payable', cashFlow: 'operating' },
    { key: 'credit_card', label: 'Credit card', cashFlow: 'operating' },
    { key: 'other_current_liability', label: 'Other current liability', cashFlow: 'operating' },
    { key: 'long_term_liability', label: 'Long-term liability', cashFlow: 'financing' },
  ],
  equity: [
    { key: 'equity', label: 'Equity', cashFlow: 'financing' },
    { key: 'retained_earnings', label: 'Retained earnings', cashFlow: 'financing' },
  ],
  income: [
    { key: 'income', label: 'Income', cashFlow: 'operating' },
    { key: 'other_income', label: 'Other income', cashFlow: 'operating' },
  ],
  expense: [
    { key: 'cost_of_services', label: 'Direct costs', cashFlow: 'operating' },
    { key: 'expense', label: 'Expense', cashFlow: 'operating' },
    { key: 'other_expense', label: 'Other expense', cashFlow: 'operating' },
  ],
};

export const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];
export const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses',
};

export function typeOfSubtype(subtype: string): AccountType | null {
  for (const t of TYPE_ORDER) if (SUBTYPES[t].some((s) => s.key === subtype)) return t;
  return null;
}

export type AccountNode = Account & { depth: number; children: AccountNode[] };

/** Number-aware comparison: "1010" < "1100" < "2000" < "X-7"; numbers sort before missing numbers. */
export function compareNumbers(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'en', { numeric: true });
}

function compareAccounts(a: Account, b: Account): number {
  return compareNumbers(a.number, b.number) || a.name.localeCompare(b.name, 'en');
}

/** Build the tree for one account type; orphans (parent missing from the list) become roots. */
export function buildTree(accounts: Account[], type?: AccountType): AccountNode[] {
  const list = type ? accounts.filter((a) => a.type === type) : accounts;
  const byId = new Map(list.map((a) => [a.id, { ...a, depth: 0, children: [] as AccountNode[] }]));
  const roots: AccountNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: AccountNode[], depth: number) => {
    nodes.sort(compareAccounts);
    for (const n of nodes) {
      n.depth = depth;
      sort(n.children, depth + 1);
    }
  };
  sort(roots, 0);
  return roots;
}

export function flatten(nodes: AccountNode[]): AccountNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Display label: "6210 Accounting" or "Accounting" when there is no number. */
export function accountLabel(a: Pick<Account, 'number' | 'name'>): string {
  return a.number ? `${a.number} ${a.name}` : a.name;
}

/** Account numbers: no whitespace, 1 to 16 characters. Mirrors the database check. */
export function validNumber(n: string): boolean {
  return /^\S{1,16}$/.test(n);
}

/** Ids that cannot be chosen as a new parent for `id`: itself and its descendants. */
export function descendantIds(accounts: Account[], id: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const a of accounts) if (a.parent_id) kids.set(a.parent_id, [...(kids.get(a.parent_id) ?? []), a.id]);
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!out.has(k)) { out.add(k); stack.push(k); }
  return out;
}

/** The first unused number at or after `start` in steps of `step` (default 10). */
export function nextFreeNumber(taken: Iterable<string | null>, start: number, step = 10): string {
  const used = new Set([...taken].filter((x): x is string => !!x));
  let n = start;
  while (used.has(String(n))) n += step;
  return String(n);
}

/** Owner-editable numbering ranges, used as a guide when suggesting numbers. */
export const DEFAULT_RANGES: Record<AccountType, { from: number; to: number }> = {
  asset: { from: 1000, to: 1999 },
  liability: { from: 2000, to: 2999 },
  equity: { from: 3000, to: 3999 },
  income: { from: 4000, to: 4999 },
  expense: { from: 5000, to: 8999 },
};

export function suggestNumber(accounts: Account[], type: AccountType): string {
  return nextFreeNumber(accounts.map((a) => a.number), DEFAULT_RANGES[type].from + 10);
}
