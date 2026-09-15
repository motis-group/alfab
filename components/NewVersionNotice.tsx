'use client';

import styles from '@components/NewVersionNotice.module.scss';

import * as React from 'react';

import ActionButton from '@components/ActionButton';
import AlertBanner from '@components/AlertBanner';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface NewVersionNoticeProps {
  /** The build id of the server that sent this page. Null when .next has no build. */
  buildId: string | null;
}

/**
 * Tells the user to reload after a deploy. The notice asks the server for its build id when the page becomes visible,
 * when the window gets focus, and every five minutes. It does not reload the page itself, because the page can hold
 * unsaved work.
 */
export default function NewVersionNotice({ buildId }: NewVersionNoticeProps) {
  const [isNewVersion, setIsNewVersion] = React.useState(false);

  React.useEffect(() => {
    if (!buildId || isNewVersion) {
      return;
    }

    const check = async () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      try {
        const response = await fetch('/api/version');
        const served = response.ok ? (await response.json()).buildId : null;
        if (served && served !== buildId) {
          setIsNewVersion(true);
        }
      } catch {
        // No network, or the server restarts for a deploy. The next check tries again.
      }
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [buildId, isNewVersion]);

  return (
    <div className={styles.root} role="status">
      {isNewVersion ? (
        <AlertBanner>
          <div className={styles.row}>
            <span>A new version of this app is available. Save your work. Then reload the page.</span>
            <ActionButton onClick={() => window.location.reload()}>Reload</ActionButton>
          </div>
        </AlertBanner>
      ) : null}
    </div>
  );
}
