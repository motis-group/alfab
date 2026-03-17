export interface AppNavigationItem {
  icon?: string;
  children: string;
  href: string;
  target?: string;
}

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { icon: '⊹', children: 'Order Dashboard', href: '/doors' },
  { icon: '⊹', children: 'New Purchase Order', href: '/doors/new' },
  { icon: '⊹', children: 'Calculator', href: '/doors/quote' },
  { icon: '⊹', children: 'Customers & Products', href: '/doors/clients' },
  { icon: '⊹', children: 'Component Library', href: '/examples' },
];

export interface AppSectionItem {
  href: string;
  label: string;
}

export const APP_WORK_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/doors', label: 'Dashboard' },
  { href: '/doors/new', label: 'New Order' },
  { href: '/doors/quote', label: 'Calculator' },
  { href: '/doors/clients', label: 'Customers' },
];

export const APP_ACCOUNT_SECTION_ITEMS: AppSectionItem[] = [
  { href: '/account', label: 'Appearance' },
  { href: '/settings', label: 'Costing' },
  { href: '/account/team', label: 'Team' },
  { href: '/settings/billing', label: 'Billing' },
];
