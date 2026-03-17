'use client';

import styles from '@components/page/AppSessionIndicator.module.scss';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';

import { CurrentSessionUser, fetchCurrentSessionUser } from '@utils/session-client';

export default function AppSessionIndicator() {
  const router = useRouter();

  const [sessionUser, setSessionUser] = useState<CurrentSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSession() {
    setIsLoading(true);
    setError(null);

    try {
      const user = await fetchCurrentSessionUser();
      setSessionUser(user);
    } catch (loadError: any) {
      setSessionUser(null);
      setError(loadError?.message || 'Unable to load session user.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function handleSignOut() {
    setIsSubmitting(true);
    setError(null);

    // Use server-side signout redirect so cookie/session clear happens before navigation.
    window.location.assign('/api/signout?next=/login');
  }

  const label = (() => {
    if (isLoading) {
      return 'User...';
    }

    if (!sessionUser) {
      return 'Sign In';
    }

    return sessionUser.username.toUpperCase();
  })();

  if (!isLoading && !sessionUser) {
    return (
      <div className={styles.root}>
        <ActionButton onClick={() => router.push('/login')}>{label}</ActionButton>
      </div>
    );
  }

  const menuItems = sessionUser
    ? [
        {
          icon: '⊹',
          children: 'Appearance',
          href: '/account',
        },
        {
          icon: '⊹',
          children: 'Costing',
          href: '/settings',
        },
        {
          icon: '⊹',
          children: 'Team',
          href: '/account/team',
        },
        {
          icon: '⊹',
          children: 'Billing',
          href: '/settings/billing',
        },
        {
          icon: '⊹',
          children: isSubmitting ? 'WORKING...' : 'SIGN OUT',
          onClick: handleSignOut,
        },
      ]
    : [];

  return (
    <div className={styles.root}>
      {sessionUser ? (
        <DropdownMenuTrigger items={menuItems}>
          <ActionButton>{label}</ActionButton>
        </DropdownMenuTrigger>
      ) : (
        <ActionButton>{label}</ActionButton>
      )}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
