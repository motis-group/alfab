'use client';

import styles from '@components/page/AppSectionNav.module.scss';

import ActionButton from '@components/ActionButton';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import { APP_WORK_SECTION_ITEMS, AppSectionItem } from '@utils/app-navigation';
import { usePathname, useRouter } from 'next/navigation';

function isSelectedPath(pathname: string, item: AppSectionItem): boolean {
  if (item.items) {
    return item.items.some((child) => isSelectedPath(pathname, child));
  }

  if (!item.href) {
    return false;
  }

  // Orders is the section root, so it would otherwise match every page under it.
  if (item.href === '/glass') {
    return pathname === '/glass';
  }

  if (item.href === '/account') {
    return pathname === '/account' || (pathname.startsWith('/account/') && !pathname.startsWith('/account/team'));
  }

  if (item.href === '/settings') {
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/billing') && !pathname.startsWith('/settings/windows'));
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface AppSectionNavProps {
  items?: AppSectionItem[];
}

export default function AppSectionNav({ items = APP_WORK_SECTION_ITEMS }: AppSectionNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <section className={styles.root} aria-label="Section navigation">
      {items.map((item) => {
        const selected = isSelectedPath(pathname, item);

        if (item.items) {
          return (
            <DropdownMenuTrigger
              key={item.label}
              items={item.items.map((child) => ({
                icon: '⊹',
                children: child.label,
                onClick: () => (child.href ? router.push(child.href) : undefined),
              }))}
            >
              <ActionButton isSelected={selected}>{item.label}</ActionButton>
            </DropdownMenuTrigger>
          );
        }

        return (
          <ActionButton key={item.href} isSelected={selected} onClick={() => (item.href ? router.push(item.href) : undefined)}>
            {item.label}
          </ActionButton>
        );
      })}
    </section>
  );
}
