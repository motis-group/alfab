export interface AppNavigationItem {
  icon?: string;
  children: string;
  href: string;
  target?: string;
}

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { icon: '⊹', children: 'Order Dashboard', href: '/glass' },
  { icon: '⊹', children: 'New Purchase Order', href: '/glass/new' },
  { icon: '⊹', children: 'Calculator', href: '/glass/quote' },
  { icon: '⊹', children: 'Customers & Products', href: '/glass/clients' },
  { icon: '⊹', children: 'Component Library', href: '/examples' },
];

export interface AppSectionItem {
  href: string;
  label: string;
}

export const APP_WORK_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/glass', label: 'Dashboard' },
  { href: '/glass/new', label: 'New Order' },
  { href: '/glass/quote', label: 'Calculator' },
  { href: '/glass/clients', label: 'Customers' },
];

export const APP_ACCOUNT_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/account', label: 'Appearance' },
  { href: '/settings', label: 'Costing' },
  { href: '/account/team', label: 'Team' },
  { href: '/settings/billing', label: 'Billing' },
];
