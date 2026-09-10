'use client';

import styles from '@components/SidebarTabs.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

export interface SidebarTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface SidebarTabsProps {
  tabs: SidebarTab[];
  /** Which tab opens first. Defaults to the first one given. */
  initial?: string;
  'aria-label'?: string;
}

/** One sidebar panel at a time. Only the open panel is rendered. */
export default function SidebarTabs({ tabs, initial, 'aria-label': ariaLabel = 'Sidebar sections' }: SidebarTabsProps) {
  const [active, setActive] = React.useState(initial || tabs[0]?.id);

  // Fall back to the first tab when the active one no longer exists.
  const current = tabs.find((tab) => tab.id === active) || tabs[0];
  if (!current) {
    return null;
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    setActive(tabs[(index + step + tabs.length) % tabs.length].id);
  }

  return (
    <section className={styles.root}>
      <div className={styles.tablist} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={tab.id === current.id ? 0 : -1}
            className={Utilities.classNames(styles.tab, tab.id === current.id ? styles.tabSelected : null)}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`tabpanel-${current.id}`} aria-labelledby={`tab-${current.id}`} tabIndex={0}>
        {current.content}
      </div>
    </section>
  );
}
