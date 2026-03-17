'use client';

import styles from '@components/page/AppSectionNav.module.scss';

import ActionButton from '@components/ActionButton';
import { APP_SECTION_ITEMS, AppSectionItem } from '@utils/app-navigation';
import { usePathname, useRouter } from 'next/navigation';

function isSelectedPath(pathname: string, item: AppSectionItem): boolean {
  if (item.href === '/doors') {
    return pathname === '/doors';
  }

  if (item.href === '/doors/new') {
    return pathname === '/doors/new';
  }

  if (item.href === '/settings') {
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/billing'));
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AppSectionNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <section className={styles.root} aria-label="Primary navigation">
      {APP_SECTION_ITEMS.map((item) => (
        <ActionButton key={item.href} isSelected={isSelectedPath(pathname, item)} onClick={() => router.push(item.href)}>
          {item.label}
        </ActionButton>
      ))}
    </section>
  );
}
