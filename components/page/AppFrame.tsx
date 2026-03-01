import styles from '@components/page/AppFrame.module.scss';

import * as React from 'react';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import Badge from '@components/Badge';
import DefaultActionBar from '@components/page/DefaultActionBar';
import DefaultLayout from '@components/page/DefaultLayout';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import Grid from '@components/Grid';
import Navigation from '@components/Navigation';
import Row from '@components/Row';
import AppSectionNav from '@components/page/AppSectionNav';
import AppSessionIndicator from '@components/page/AppSessionIndicator';

interface NavigationItem {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  href?: string;
  target?: React.HTMLAttributeAnchorTarget;
  [key: string]: any;
}

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
  navigationItems?: NavigationItem[];
  navLabel?: React.ReactNode;
  navRight?: React.ReactNode;
  heading?: React.ReactNode;
  badge?: React.ReactNode;
  actionItems?: FrameActionItem[];
  showThemeControls?: boolean;
  showSectionNavigation?: boolean;
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
  navigationItems = [],
  navLabel,
  navRight,
  heading,
  badge,
  actionItems = [],
  showThemeControls = false,
  showSectionNavigation = true,
  showSessionIndicator = true,
  sidebar,
  sidebarAriaLabel = 'Page sidebar',
  sidebarPosition = 'left',
  sidebarWidthCh = 42,
  sidebarMobileOrder = 'top',
  children,
}) => {
  let left: React.ReactNode = null;

  if (navLabel && !showSectionNavigation) {
    if (navigationItems.length) {
      left = (
        <DropdownMenuTrigger items={navigationItems}>
          <ActionButton>{navLabel}</ActionButton>
        </DropdownMenuTrigger>
      );
    } else {
      left = <ActionButton>{navLabel}</ActionButton>;
    }
  }

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
        <Navigation logo={logo} left={left} right={right} />

        {showSectionNavigation ? <AppSectionNav /> : null}

        {showThemeControls && <DefaultActionBar floating />}

        {heading && (
          <Row>
            {heading}
            {badge ? <Badge>{badge}</Badge> : null}
          </Row>
        )}

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
