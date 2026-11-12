-- MyBooks Phase 1: report lines and the standard chart of accounts templates.
-- Numbers follow the proposed ranges in the design document. They are a convention,
-- not a rule: the owner can renumber any account, and edit the templates themselves.

-- Seeding must not flood the audit log.
select set_config('mybooks.bulk', 'on', false);

insert into public.report_lines (key, name, section, sort_order) values
  ('cash_bank',                 'Cash and bank',                    'asset',       10),
  ('accounts_receivable',       'Accounts receivable',              'asset',       20),
  ('other_current_assets',      'Other current assets',             'asset',       30),
  ('due_from_affiliates',       'Due from affiliates',              'asset',       40),
  ('fixed_assets',              'Fixed assets, at cost',            'asset',       50),
  ('accumulated_depreciation',  'Accumulated depreciation',         'asset',       60),
  ('investments_in_affiliates', 'Investments in affiliates',        'asset',       70),
  ('other_assets',              'Other assets',                     'asset',       80),
  ('accounts_payable',          'Accounts payable',                 'liability',  110),
  ('credit_cards',              'Credit cards',                     'liability',  120),
  ('customer_deposits',         'Customer deposits and retainers',  'liability',  130),
  ('security_deposits_held',    'Security deposits held',           'liability',  140),
  ('other_current_liabilities', 'Other current liabilities',        'liability',  150),
  ('due_to_affiliates',         'Due to affiliates',                'liability',  160),
  ('loans_mortgages',           'Loans and mortgages',              'liability',  170),
  ('member_capital',            'Member capital',                   'equity',     210),
  ('member_distributions',      'Member distributions',             'equity',     220),
  ('retained_earnings',         'Retained earnings',                'equity',     230),
  ('opening_balance_equity',    'Opening balance equity',           'equity',     240),
  ('service_revenue',           'Service revenue',                  'income',     310),
  ('rental_income',             'Rental income',                    'income',     320),
  ('other_income',              'Other income',                     'income',     330),
  ('personal_income',           'Personal income',                  'income',     340),
  ('direct_costs',              'Direct costs',                     'direct_cost',410),
  ('marketing',                 'Marketing',                        'expense',    510),
  ('insurance',                 'Insurance',                        'expense',    520),
  ('rent_lease',                'Rent and lease',                   'expense',    530),
  ('professional_fees',         'Professional fees',                'expense',    540),
  ('repairs_maintenance',       'Repairs and maintenance',          'expense',    550),
  ('taxes_licenses',            'Taxes and licenses',               'expense',    560),
  ('utilities',                 'Utilities',                        'expense',    570),
  ('property_management',       'Property management',              'expense',    575),
  ('office_general',            'Office and general',               'expense',    580),
  ('software_subscriptions',    'Software and subscriptions',       'expense',    585),
  ('travel_meals',              'Travel and meals',                 'expense',    590),
  ('partner_compensation',      'Partner compensation',             'expense',    595),
  ('depreciation_expense',      'Depreciation',                     'expense',    610),
  ('interest_expense',          'Interest',                         'expense',    620),
  ('personal_expense',          'Personal spending',                'expense',    630),
  ('suspense',                  'Uncategorized and discrepancies',  'other',      700),
  ('other_expense',             'Other expense',                    'other',      710),
  ('gain_loss_on_sale',         'Gain or loss on sale of assets',   'other',      720);

insert into public.account_templates (key, name, scope, description, sort_order) values
  ('business_base',    'Base chart',        'business_base', 'Applies to every business: cash, receivables, payables, cards, equity, general operating expenses, and the system accounts.', 10),
  ('service_business', 'Service business',  'module',        'Project revenue, subconsultants and reimbursables, customer deposits and retainers, partner guaranteed payments.', 20),
  ('real_estate',      'Real estate holding','module',       'Rental income, land, buildings, improvements and appliances with their accumulated depreciation, mortgage, security deposits, property costs.', 30),
  ('holding_company',  'Holding company',   'module',        'Investments in subsidiaries and distributions received. Due to and from affiliates are in the base chart.', 40),
  ('personal',         'Personal',          'personal',      'Starter personal chart, cash basis. Replace the categories with your own list.', 50);

-- ---------------------------------------------------------------------------
-- Base chart
-- ---------------------------------------------------------------------------
insert into public.template_accounts
  (template_key, key, number, name, type, subtype, parent_key, report_line_key, is_system, sort_order)
select 'business_base', v.k, v.n, v.nm, v.ty::public.account_type, v.st, v.pk, v.rl, v.sys, v.n::int
from (values
  ('base.cash.operating', '1010', 'Operating checking',  'asset',     'bank',                     null,            'cash_bank',                 false),
  ('base.cash.savings',   '1020', 'Savings',             'asset',     'bank',                     null,            'cash_bank',                 false),
  ('base.ar',             '1100', 'Accounts receivable', 'asset',     'accounts_receivable',      null,            'accounts_receivable',       true),
  ('base.prepaid',        '1200', 'Prepaid expenses',    'asset',     'other_current_asset',      null,            'other_current_assets',      false),
  ('base.escrow',         '1210', 'Escrow and deposits', 'asset',     'other_current_asset',      null,            'other_current_assets',      false),
  ('base.due_from',       '1250', 'Due from affiliates', 'asset',     'other_current_asset',      null,            'due_from_affiliates',       false),
  ('base.fa.furniture',   '1550', 'Furniture and equipment', 'asset', 'fixed_asset',              null,            'fixed_assets',              false),
  ('base.ad.furniture',   '1650', 'Accumulated depreciation - furniture and equipment', 'asset', 'accumulated_depreciation', null, 'accumulated_depreciation', false),
  ('base.ap',             '2000', 'Accounts payable',    'liability', 'accounts_payable',         null,            'accounts_payable',          true),
  ('base.cc',             '2050', 'Credit card',         'liability', 'credit_card',              null,            'credit_cards',              false),
  ('base.accrued',        '2100', 'Accrued expenses',    'liability', 'other_current_liability',  null,            'other_current_liabilities', false),
  ('base.due_to',         '2200', 'Due to affiliates',   'liability', 'other_current_liability',  null,            'due_to_affiliates',         false),
  ('base.eq.capital',     '3000', 'Member capital',      'equity',    'equity',                   null,            'member_capital',            false),
  ('base.eq.contrib',     '3010', 'Member contributions','equity',    'equity',                   null,            'member_capital',            false),
  ('base.eq.dist',        '3100', 'Member distributions','equity',    'equity',                   null,            'member_distributions',      false),
  ('base.eq.retained',    '3900', 'Retained earnings',   'equity',    'retained_earnings',        null,            'retained_earnings',         true),
  ('base.eq.obe',         '3999', 'Opening balance equity','equity',  'equity',                   null,            'opening_balance_equity',    true),
  ('base.inc.other',      '4900', 'Other income',        'income',    'other_income',             null,            'other_income',              false),
  ('base.inc.uncat',      '4990', 'Uncategorized income','income',    'income',                   null,            'suspense',                  true),
  ('base.exp.marketing',  '6000', 'Advertising and marketing', 'expense', 'expense',              null,            'marketing',                 false),
  ('base.exp.insurance',  '6100', 'Insurance',           'expense',   'expense',                  null,            'insurance',                 false),
  ('base.exp.rent',       '6150', 'Rent and lease',      'expense',   'expense',                  null,            'rent_lease',                false),
  ('base.exp.prof',       '6200', 'Professional fees',   'expense',   'expense',                  null,            'professional_fees',         false),
  ('base.exp.prof.acct',  '6210', 'Accounting',          'expense',   'expense',                  'base.exp.prof', 'professional_fees',         false),
  ('base.exp.prof.legal', '6220', 'Legal',               'expense',   'expense',                  'base.exp.prof', 'professional_fees',         false),
  ('base.exp.repairs',    '6300', 'Repairs and maintenance', 'expense','expense',                  null,            'repairs_maintenance',       false),
  ('base.exp.taxes',      '6400', 'Taxes and licenses',  'expense',   'expense',                  null,            'taxes_licenses',            false),
  ('base.exp.utilities',  '6500', 'Utilities',           'expense',   'expense',                  null,            'utilities',                 false),
  ('base.exp.office',     '6600', 'Office and general',  'expense',   'expense',                  null,            'office_general',            false),
  ('base.exp.bankfees',   '6610', 'Bank and merchant fees','expense', 'expense',                  'base.exp.office','office_general',           false),
  ('base.exp.software',   '6700', 'Software and subscriptions','expense','expense',               null,            'software_subscriptions',    false),
  ('base.exp.travel',     '6800', 'Travel and meals',    'expense',   'expense',                  null,            'travel_meals',              false),
  ('base.exp.depr',       '6900', 'Depreciation expense','expense',   'expense',                  null,            'depreciation_expense',      false),
  ('base.exp.uncat',      '6990', 'Uncategorized expense','expense',  'expense',                  null,            'suspense',                  true),
  ('base.exp.recon',      '6999', 'Reconciliation discrepancies','expense','expense',             null,            'suspense',                  true),
  ('base.int.interest',   '7000', 'Interest expense',    'expense',   'other_expense',            null,            'interest_expense',          false),
  ('base.other.gain',     '8000', 'Gain or loss on sale of assets','income','other_income',       null,            'gain_loss_on_sale',         false),
  ('base.other.expense',  '8100', 'Other expense',       'expense',   'other_expense',            null,            'other_expense',             false)
) as v(k, n, nm, ty, st, pk, rl, sys);

-- ---------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------
insert into public.template_accounts
  (template_key, key, number, name, type, subtype, parent_key, report_line_key, is_system, sort_order)
select 'service_business', v.k, v.n, v.nm, v.ty::public.account_type, v.st, v.pk, v.rl, false, v.n::int
from (values
  ('svc.deposits',    '2110', 'Customer deposits and retainers', 'liability', 'other_current_liability', null, 'customer_deposits'),
  ('svc.rev.project', '4000', 'Project revenue',                 'income',    'income',                  null, 'service_revenue'),
  ('svc.rev.reimb',   '4050', 'Reimbursable revenue',            'income',    'income',                  null, 'service_revenue'),
  ('svc.cost.sub',    '5000', 'Subconsultants',                  'expense',   'cost_of_services',        null, 'direct_costs'),
  ('svc.cost.reimb',  '5100', 'Reimbursable costs',              'expense',   'cost_of_services',        null, 'direct_costs'),
  ('svc.exp.guaranteed','6750','Guaranteed payments to partners','expense',   'expense',                 null, 'partner_compensation')
) as v(k, n, nm, ty, st, pk, rl);

insert into public.template_accounts
  (template_key, key, number, name, type, subtype, parent_key, report_line_key, is_system, sort_order)
select 'real_estate', v.k, v.n, v.nm, v.ty::public.account_type, v.st, v.pk, v.rl, false, v.n::int
from (values
  ('re.fa.land',     '1500', 'Land',                          'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.fa.bldg',     '1510', 'Buildings',                     'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.fa.bldgimp',  '1520', 'Building improvements',         'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.fa.landimp',  '1530', 'Land improvements',             'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.fa.appl',     '1540', 'Appliances and equipment',      'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.fa.cip',      '1590', 'Construction in progress',      'asset',     'fixed_asset',              null,                'fixed_assets'),
  ('re.ad.bldg',     '1610', 'Accumulated depreciation - buildings',              'asset', 'accumulated_depreciation', null, 'accumulated_depreciation'),
  ('re.ad.bldgimp',  '1620', 'Accumulated depreciation - building improvements',  'asset', 'accumulated_depreciation', null, 'accumulated_depreciation'),
  ('re.ad.landimp',  '1630', 'Accumulated depreciation - land improvements',      'asset', 'accumulated_depreciation', null, 'accumulated_depreciation'),
  ('re.ad.appl',     '1640', 'Accumulated depreciation - appliances and equipment','asset','accumulated_depreciation', null, 'accumulated_depreciation'),
  ('re.sec',         '2120', 'Security deposits held',        'liability', 'other_current_liability',  null,                'security_deposits_held'),
  ('re.loan.mortgage','2500','Mortgage payable',              'liability', 'long_term_liability',      null,                'loans_mortgages'),
  ('re.loan.other',  '2510', 'Other loans',                   'liability', 'long_term_liability',      null,                'loans_mortgages'),
  ('re.inc.rent',    '4100', 'Rental income',                 'income',    'income',                   null,                'rental_income'),
  ('re.inc.other',   '4110', 'Late fees and other rental income','income', 'income',                   null,                'rental_income'),
  ('re.exp.mgmt',    '6350', 'Property management',           'expense',   'expense',                  null,                'property_management'),
  ('re.exp.proptax', '6410', 'Property taxes',                'expense',   'expense',                  'base.exp.taxes',    'taxes_licenses'),
  ('re.int.mortgage','7010', 'Mortgage interest',             'expense',   'other_expense',            'base.int.interest', 'interest_expense')
) as v(k, n, nm, ty, st, pk, rl);

insert into public.template_accounts
  (template_key, key, number, name, type, subtype, parent_key, report_line_key, is_system, sort_order)
select 'holding_company', v.k, v.n, v.nm, v.ty::public.account_type, v.st, v.pk, v.rl, false, v.n::int
from (values
  ('hold.invest',   '1700', 'Investments in subsidiaries',     'asset',  'other_asset',  null, 'investments_in_affiliates'),
  ('hold.inc.dist', '4200', 'Distributions from subsidiaries', 'income', 'other_income', null, 'other_income')
) as v(k, n, nm, ty, st, pk, rl);

-- ---------------------------------------------------------------------------
-- Personal (starter; cash basis; replace categories with the owner's list)
-- ---------------------------------------------------------------------------
insert into public.template_accounts
  (template_key, key, number, name, type, subtype, parent_key, report_line_key, is_system, sort_order)
select 'personal', v.k, v.n, v.nm, v.ty::public.account_type, v.st, null, v.rl, v.sys, v.n::int
from (values
  ('p.bank.checking', '1010', 'Checking',                'asset',     'bank',                'cash_bank',          false),
  ('p.bank.savings',  '1020', 'Savings',                 'asset',     'bank',                'cash_bank',          false),
  ('p.home',          '1500', 'Residence',               'asset',     'fixed_asset',         'fixed_assets',       false),
  ('p.invest',        '1700', 'Investments',             'asset',     'other_asset',         'other_assets',       false),
  ('p.cc',            '2050', 'Credit card',             'liability', 'credit_card',         'credit_cards',       false),
  ('p.mortgage',      '2500', 'Mortgage',                'liability', 'long_term_liability', 'loans_mortgages',    false),
  ('p.eq.net',        '3000', 'Net worth',               'equity',    'equity',              'member_capital',     false),
  ('p.eq.retained',   '3900', 'Retained earnings',       'equity',    'retained_earnings',   'retained_earnings',  true),
  ('p.eq.obe',        '3999', 'Opening balance equity',  'equity',    'equity',              'opening_balance_equity', true),
  ('p.inc.wages',     '4000', 'Wages and salary',        'income',    'income',              'personal_income',    false),
  ('p.inc.invest',    '4100', 'Investment income',       'income',    'income',              'personal_income',    false),
  ('p.inc.uncat',     '4990', 'Uncategorized income',    'income',    'income',              'suspense',           true),
  ('p.exp.housing',   '6000', 'Housing',                 'expense',   'expense',             'personal_expense',   false),
  ('p.exp.utilities', '6100', 'Utilities',               'expense',   'expense',             'personal_expense',   false),
  ('p.exp.food',      '6200', 'Food and groceries',      'expense',   'expense',             'personal_expense',   false),
  ('p.exp.transport', '6300', 'Transportation',          'expense',   'expense',             'personal_expense',   false),
  ('p.exp.insurance', '6400', 'Insurance',               'expense',   'expense',             'personal_expense',   false),
  ('p.exp.medical',   '6500', 'Medical',                 'expense',   'expense',             'personal_expense',   false),
  ('p.exp.dining',    '6600', 'Dining and entertainment','expense',   'expense',             'personal_expense',   false),
  ('p.exp.travel',    '6700', 'Travel',                  'expense',   'expense',             'personal_expense',   false),
  ('p.exp.taxes',     '6800', 'Taxes',                   'expense',   'expense',             'personal_expense',   false),
  ('p.exp.giving',    '6850', 'Charitable giving',       'expense',   'expense',             'personal_expense',   false),
  ('p.exp.other',     '6900', 'Other personal',          'expense',   'expense',             'personal_expense',   false),
  ('p.exp.uncat',     '6990', 'Uncategorized expense',   'expense',   'expense',             'suspense',           true),
  ('p.exp.recon',     '6999', 'Reconciliation discrepancies','expense','expense',            'suspense',           true)
) as v(k, n, nm, ty, st, rl, sys);

select set_config('mybooks.bulk', 'off', false);
