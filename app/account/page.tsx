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
      navLabel="USER SETTINGS"
      navRight={<ActionButton onClick={() => router.push('/settings')}>GO TO COSTING</ActionButton>}
      heading="USER SETTINGS"
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

          {!isLoading && currentUser ? (
            <Card title="ACCOUNT SUMMARY">
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
            </Card>
          ) : null}

          <CardDouble title="APPEARANCE">
            <Text>Theme, tint, and font choices are personal settings and now live outside the costing pages.</Text>
            <br />
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
              <Text>Invite teammates, create users, and reset passwords from a dedicated access page.</Text>
              <br />
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
      <CardDouble title="SETTINGS MAP">
        <Text>Operational configuration stays in the app navigation. Personal and access controls stay here.</Text>
        <br />
        <Table>
          <TableRow>
            <TableColumn style={{ width: '22ch' }}>DESTINATION</TableColumn>
            <TableColumn>USE</TableColumn>
          </TableRow>
          <TableRow>
            <TableColumn>COSTING SETTINGS</TableColumn>
            <TableColumn>Update glass, edgework, and service pricing for the calculator.</TableColumn>
          </TableRow>
          <TableRow>
            <TableColumn>HOSTING BILLING</TableColumn>
            <TableColumn>Manage subscription billing for the app itself.</TableColumn>
          </TableRow>
          <TableRow>
            <TableColumn>USER SETTINGS</TableColumn>
            <TableColumn>Change your personal appearance preferences and review access details.</TableColumn>
          </TableRow>
          <TableRow>
            <TableColumn>TEAM ACCESS</TableColumn>
            <TableColumn>Invite teammates or manage user passwords and roles when your access level allows it.</TableColumn>
          </TableRow>
        </Table>
      </CardDouble>

      <Card title="WHY THIS PAGE EXISTS">
        <Text>Costing and billing are operational admin tasks. Appearance, account context, and teammate access are user settings, so they should not compete with the top-level workflow navigation.</Text>
      </Card>
    </AppFrame>
  );
}
