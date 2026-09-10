export interface AppSectionItem {
  /** Omitted on a group; the group's items carry their own. */
  href?: string;
  label: string;
  /** Present on a group. Rendered as a dropdown. */
  items?: AppSectionItem[];
}

/**
 * The work sections. Quotes and purchase orders are the same record at different statuses, so both
 * live under Orders. The three calculators price different products onto that one quote, so they
 * are a group rather than three peers of Orders.
 */
export const APP_WORK_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/glass', label: 'Orders' },
  {
    label: 'Calculators',
    items: [
      { href: '/glass/quote', label: 'Glass' },
      { href: '/glass/windows', label: 'Windows' },
      { href: '/glass/awnings', label: 'Awnings' },
    ],
  },
  { href: '/glass/clients', label: 'Customers' },
];

export const APP_ACCOUNT_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/account', label: 'Appearance' },
  { href: '/settings', label: 'Costing' },
  { href: '/settings/windows', label: 'Window Rates' },
  { href: '/settings/awnings', label: 'Awning Rates' },
  { href: '/settings/drift', label: 'Price Drift' },
  { href: '/account/team', label: 'Team' },
  { href: '/settings/billing', label: 'Billing' },
];
