'use client';

import styles from '@components/page/AppSectionNav.module.scss';

import ActionButton from '@components/ActionButton';
import { APP_WORK_SECTION_ITEMS, AppSectionItem } from '@utils/app-navigation';
import { usePathname, useRouter } from 'next/navigation';

function isSelectedPath(pathname: string, item: AppSectionItem): boolean {
  if (item.href === '/doors') {
    return pathname === '/doors';
  }

  if (item.href === '/doors/new') {
    return pathname === '/doors/new';
  }

  if (item.href === '/account') {
    return pathname === '/account' || (pathname.startsWith('/account/') && !pathname.startsWith('/account/team'));
  }

  if (item.href === '/settings') {
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/billing'));
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
      {items.map((item) => (
        <ActionButton key={item.href} isSelected={isSelectedPath(pathname, item)} onClick={() => router.push(item.href)}>
          {item.label}
        </ActionButton>
      ))}
    </section>
  );
}
