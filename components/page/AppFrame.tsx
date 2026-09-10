import styles from '@components/page/AppFrame.module.scss';

import * as React from 'react';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import DefaultActionBar from '@components/page/DefaultActionBar';
import DefaultLayout from '@components/page/DefaultLayout';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import Grid from '@components/Grid';
import Navigation from '@components/Navigation';
import AppSectionNav from '@components/page/AppSectionNav';
import AppSessionIndicator from '@components/page/AppSessionIndicator';
import { AppSectionItem } from '@utils/app-navigation';

interface FrameActionItem {
  hotkey?: string;
  onClick?: () => void;
  openHotkey?: string;
  selected?: boolean;
  body: React.ReactNode;
  items?: any;
}

interface AppFrameProps {
  previewPixelSRC: string;
  logo?: React.ReactNode;
  navRight?: React.ReactNode;
  heading?: React.ReactNode;
  badge?: React.ReactNode;
  actionItems?: FrameActionItem[];
  showThemeControls?: boolean;
  showSectionNavigation?: boolean;
  sectionNavigationItems?: AppSectionItem[];
  showSessionIndicator?: boolean;
  sidebar?: React.ReactNode;
  sidebarAriaLabel?: string;
  sidebarPosition?: 'left' | 'right';
  sidebarWidthCh?: number;
  sidebarMobileOrder?: 'top' | 'bottom';
  children?: React.ReactNode;
}

const AppFrame: React.FC<AppFrameProps> = ({
  previewPixelSRC,
  logo = '⬡',
  navRight,
  actionItems = [],
  showThemeControls = false,
  showSectionNavigation = true,
  sectionNavigationItems,
  showSessionIndicator = true,
  sidebar,
  sidebarAriaLabel = 'Page sidebar',
  sidebarPosition = 'left',
  sidebarWidthCh = 42,
  sidebarMobileOrder = 'top',
  children,
}) => {
  const right = navRight || showSessionIndicator ? (
    <div className={styles.navRight}>
      {navRight}
      {showSessionIndicator ? <AppSessionIndicator /> : null}
    </div>
  ) : null;

  const contentStyle = sidebar ? ({ ['--app-sidebar-width' as any]: `${sidebarWidthCh}ch` } as React.CSSProperties) : undefined;

  return (
    <DefaultLayout previewPixelSRC={previewPixelSRC} variant="wide">
      <Grid className={styles.root}>
        <Navigation logo={logo} right={right} />

        {showSectionNavigation ? <AppSectionNav items={sectionNavigationItems} /> : null}

        {showThemeControls && <DefaultActionBar floating />}

        {actionItems.length ? <ActionBar items={actionItems} /> : null}

        {sidebar ? (
          <section className={styles.columns} data-sidebar-position={sidebarPosition} data-sidebar-mobile-order={sidebarMobileOrder} style={contentStyle}>
            <aside className={styles.sidebar} aria-label={sidebarAriaLabel}>
              {sidebar}
            </aside>
            <main className={styles.main} aria-label="Main content">
              {children}
            </main>
          </section>
        ) : (
          <main className={styles.singleColumn} aria-label="Main content">
            {children}
          </main>
        )}
      </Grid>
    </DefaultLayout>
  );
};

export default AppFrame;
