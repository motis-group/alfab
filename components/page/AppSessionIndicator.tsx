'use client';

import styles from '@components/page/AppSessionIndicator.module.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';

import { APP_ROLES, AppRole } from '@utils/authz';
import { CurrentSessionUser, fetchCurrentSessionUser } from '@utils/session-client';

function formatRoleLabel(role: string): string {
  return role.replace('_', ' ').toUpperCase();
}

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

  async function switchSessionRole(nextRole: AppRole) {
    if (!sessionUser?.canOverrideSessionRole) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/session-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: nextRole }),
      });

      const data = (await response.json().catch(() => null)) as { user?: CurrentSessionUser; error?: string } | null;
      if (!response.ok || !data?.user) {
        throw new Error(data?.error || 'Unable to switch session role.');
      }

      setSessionUser(data.user);
      router.refresh();
    } catch (switchError: any) {
      setError(switchError?.message || 'Unable to switch session role.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const label = useMemo(() => {
    if (isLoading) {
      return 'Session...';
    }

    if (!sessionUser) {
      return 'Sign In';
    }

    return `${sessionUser.username.toUpperCase()} [${formatRoleLabel(sessionUser.effectiveRole)}]`;
  }, [isLoading, sessionUser]);

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
          children: `USER ${sessionUser.username.toUpperCase()}`,
        },
        {
          icon: '⊹',
          children: `BASE ROLE ${formatRoleLabel(sessionUser.role)}`,
        },
        {
          icon: '⊹',
          children: `SESSION ROLE ${formatRoleLabel(sessionUser.effectiveRole)}`,
        },
        ...(sessionUser.canOverrideSessionRole
          ? APP_ROLES.map((role) => ({
              icon: sessionUser.effectiveRole === role ? '◉' : '◌',
              children: `SWITCH TO ${formatRoleLabel(role)}`,
              onClick: () => switchSessionRole(role),
            }))
          : []),
        {
          icon: '⊹',
          children: 'OPEN USER SETTINGS',
          href: '/settings/users',
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
