'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import DefaultActionBar from '@components/page/DefaultActionBar';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import { useThemePreferences } from '@components/ThemeProvider';

import { CurrentSessionUser, fetchCurrentSessionUser } from '@utils/session-client';
import { THEME_MODE_OPTIONS, THEME_TINT_OPTIONS } from '@utils/theme-preferences';
import { APP_ACCOUNT_SECTION_ITEMS } from '@utils/app-navigation';

const navigationItems = APP_NAVIGATION_ITEMS;

function formatRoleLabel(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return value.replace(/_/g, ' ').toUpperCase();
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { themePreferences, isSaving, error: themeError } = useThemePreferences();

  const [currentUser, setCurrentUser] = useState<CurrentSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageTeam = currentUser?.role === 'superadmin' || currentUser?.effectiveRole === 'superadmin' || currentUser?.effectiveRole === 'admin';

  const badgeText = useMemo(() => {
    if (!currentUser) {
      return 'LOADING';
    }

    return formatRoleLabel(currentUser.effectiveRole);
  }, [currentUser]);

  const currentModeLabel = THEME_MODE_OPTIONS.find((option) => option.value === themePreferences.mode)?.label || 'Light';
  const currentTintLabel = THEME_TINT_OPTIONS.find((option) => option.value === themePreferences.tint)?.label || 'None';

  async function loadCurrentUser() {
    setIsLoading(true);
    setError(null);

    try {
      const sessionUser = await fetchCurrentSessionUser();
      if (!sessionUser) {
        router.push('/login');
        return;
      }

      setCurrentUser(sessionUser);
    } catch (loadError: any) {
      setCurrentUser(null);
      setError(loadError?.message || 'Unable to load account settings.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentUser();
  }, []);

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="APPEARANCE"
      heading="APPEARANCE"
      sectionNavigationItems={APP_ACCOUNT_SECTION_ITEMS}
      badge={badgeText}
      sidebarWidthCh={48}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {error ? (
            <Card title="ACCOUNT ERROR">
              <Text>
                <span className="status-error">{error}</span>
              </Text>
            </Card>
          ) : null}

          {isLoading ? (
            <Card title="LOADING">
              <Text>Loading account settings...</Text>
            </Card>
          ) : null}

          <CardDouble title="APPEARANCE">
            <DefaultActionBar />
            <br />
            {themeError ? (
              <Text>
                <span className="status-error">{themeError}</span>
              </Text>
            ) : (
              <Text style={{ opacity: 0.75 }}>{isSaving ? 'Saving appearance...' : `Saved: ${currentModeLabel} / ${currentTintLabel}`}</Text>
            )}
          </CardDouble>

          {!isLoading && canManageTeam ? (
            <Card title="TEAM ACCESS">
              <ActionButton onClick={() => router.push('/account/team')}>Open Team Access</ActionButton>
            </Card>
          ) : null}
        </>
      }
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reload',
          onClick: loadCurrentUser,
        },
        {
          hotkey: '⌘+B',
          body: 'Costing',
          onClick: () => router.push('/settings'),
        },
      ]}
    >
      {!isLoading && currentUser ? (
        <CardDouble title="ACCOUNT SUMMARY">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '20ch' }}>USERNAME</TableColumn>
              <TableColumn>{currentUser.username}</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>BASE ROLE</TableColumn>
              <TableColumn>{formatRoleLabel(currentUser.role)}</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>CURRENT ACCESS</TableColumn>
              <TableColumn>{formatRoleLabel(currentUser.effectiveRole)}</TableColumn>
            </TableRow>
          </Table>
        </CardDouble>
      ) : null}

      {!isLoading && canManageTeam ? (
        <Card title="TEAM ACCESS">
          <ActionButton onClick={() => router.push('/account/team')}>Open Team Access</ActionButton>
        </Card>
      ) : null}
    </AppFrame>
  );
}
