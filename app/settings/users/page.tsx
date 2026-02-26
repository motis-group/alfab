'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { APP_ROLES, AppRole } from '@utils/authz';
import { CurrentSessionUser, fetchCurrentSessionUser } from '@utils/session-client';

interface ManagedUser {
  id: string;
  username: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

interface InviteRecord {
  id: string;
  email: string | null;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by_username: string | null;
}

interface UserDraft {
  role: AppRole;
  isActive: boolean;
  password: string;
}

const navigationItems = APP_NAVIGATION_ITEMS;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-AU');
}

export default function UserSettingsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentSessionUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});

  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<AppRole>('standard');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('standard');
  const [inviteHours, setInviteHours] = useState('72');
  const [latestInviteUrl, setLatestInviteUrl] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperadmin = currentUser?.role === 'superadmin';
  const canInvite = isSuperadmin || currentUser?.effectiveRole === 'superadmin' || currentUser?.effectiveRole === 'admin';

  const badgeText = useMemo(() => {
    if (!currentUser) {
      return 'LOADING';
    }

    return `${currentUser.effectiveRole.toUpperCase()} SESSION`;
  }, [currentUser]);

  function resetCreateForm() {
    setCreateUsername('');
    setCreatePassword('');
    setCreateRole('standard');
  }

  function populateDrafts(rows: ManagedUser[]) {
    const nextDrafts: Record<string, UserDraft> = {};
    rows.forEach((user) => {
      nextDrafts[user.id] = {
        role: user.role,
        isActive: user.is_active,
        password: '',
      };
    });
    setDrafts(nextDrafts);
  }

  async function loadUsers() {
    if (!isSuperadmin) {
      setUsers([]);
      setDrafts({});
      return;
    }

    const response = await fetch('/api/users', { cache: 'no-store' });
    const data = (await response.json().catch(() => null)) as { users?: ManagedUser[]; error?: string } | null;

    if (!response.ok) {
      throw new Error(data?.error || 'Unable to load users.');
    }

    const loadedUsers = data?.users || [];
    setUsers(loadedUsers);
    populateDrafts(loadedUsers);
  }

  async function loadInvites() {
    if (!canInvite) {
      setInvites([]);
      return;
    }

    const response = await fetch('/api/users/invites', { cache: 'no-store' });
    const data = (await response.json().catch(() => null)) as { invites?: InviteRecord[]; error?: string } | null;

    if (!response.ok) {
      throw new Error(data?.error || 'Unable to load invites.');
    }

    setInvites(data?.invites || []);
  }

  async function loadAll() {
    setIsLoading(true);
    setError(null);

    try {
      const sessionUser = await fetchCurrentSessionUser();
      if (!sessionUser) {
        router.push('/login');
        return;
      }

      setCurrentUser(sessionUser);

      if (sessionUser.role === 'superadmin') {
        const response = await fetch('/api/users', { cache: 'no-store' });
        const data = (await response.json().catch(() => null)) as { users?: ManagedUser[]; error?: string } | null;
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load users.');
        }
        const loadedUsers = data?.users || [];
        setUsers(loadedUsers);
        populateDrafts(loadedUsers);
      } else {
        setUsers([]);
        setDrafts({});
      }

      if (sessionUser.role === 'superadmin' || sessionUser.effectiveRole === 'admin') {
        const inviteResponse = await fetch('/api/users/invites', { cache: 'no-store' });
        const inviteData = (await inviteResponse.json().catch(() => null)) as { invites?: InviteRecord[]; error?: string } | null;
        if (!inviteResponse.ok) {
          throw new Error(inviteData?.error || 'Unable to load invites.');
        }
        setInvites(inviteData?.invites || []);
      } else {
        setInvites([]);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load user settings.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);


  async function createInvite() {
    if (!canInvite) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/users/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: isSuperadmin ? inviteRole : undefined,
          expiresHours: Number(inviteHours) || 72,
        }),
      });

      const data = (await response.json().catch(() => null)) as { inviteUrl?: string; error?: string } | null;
      if (!response.ok || !data?.inviteUrl) {
        throw new Error(data?.error || 'Unable to create invite link.');
      }

      setLatestInviteUrl(data.inviteUrl);
      setInviteEmail('');
      await loadInvites();
    } catch (inviteError: any) {
      setError(inviteError?.message || 'Unable to create invite link.');
    } finally {
      setIsSaving(false);
    }
  }

  async function createUser() {
    if (!isSuperadmin) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          role: createRole,
          isActive: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to create user.');
      }

      resetCreateForm();
      await loadUsers();
    } catch (createError: any) {
      setError(createError?.message || 'Unable to create user.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveUser(userId: string) {
    if (!isSuperadmin) {
      return;
    }

    const draft = drafts[userId];
    if (!draft) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: userId,
          role: draft.role,
          isActive: draft.isActive,
          password: draft.password || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to update user.');
      }

      await loadUsers();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to update user.');
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraft(userId: string, updater: (draft: UserDraft) => UserDraft) {
    setDrafts((prev) => {
      const current = prev[userId] || {
        role: 'standard',
        isActive: true,
        password: '',
      };

      return {
        ...prev,
        [userId]: updater(current),
      };
    });
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="USER SETTINGS"
      navRight={<ActionButton onClick={() => router.push('/settings')}>BACK TO SETTINGS</ActionButton>}
      heading="USER MANAGEMENT"
      badge={badgeText}
      showThemeControls
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reload',
          onClick: loadAll,
        },
        {
          hotkey: '⌘+B',
          body: 'Back',
          onClick: () => router.push('/settings'),
        },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      {isLoading && (
        <Card title="LOADING">
          <Text>Loading user settings...</Text>
        </Card>
      )}

      {!isLoading && !canInvite && !isSuperadmin && (
        <Card title="NO ACCESS">
          <Text>
            <span className="status-warning">You do not have permission to manage users.</span>
          </Text>
        </Card>
      )}

      {!isLoading && canInvite && (
        <CardDouble title="INVITE USERS">
          <Text>Admins and superadmins can generate one-time join links.</Text>
          <Input label="EMAIL (OPTIONAL)" name="invite_email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@company.com" />
          <Input label="EXPIRES IN HOURS" name="expires_hours" type="number" value={inviteHours} onChange={(event) => setInviteHours(event.target.value)} />

          <Text>INVITED ROLE</Text>
          <select value={isSuperadmin ? inviteRole : 'standard'} onChange={(event) => setInviteRole(event.target.value as AppRole)} disabled={!isSuperadmin}>
            <option value="standard">STANDARD</option>
            <option value="readonly">READONLY</option>
            {isSuperadmin && <option value="admin">ADMIN</option>}
          </select>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={createInvite}>{isSaving ? 'Generating...' : 'Generate Invite Link'}</ActionButton>
            <ActionButton onClick={() => setLatestInviteUrl('')}>Clear Latest Link</ActionButton>
          </RowSpaceBetween>

          {latestInviteUrl ? (
            <>
              <br />
              <Text>
                <span className="status-success">Latest join link:</span>
              </Text>
              <Input label="JOIN LINK" name="latest_invite_link" value={latestInviteUrl} readOnly />
            </>
          ) : null}
        </CardDouble>
      )}

      {!isLoading && isSuperadmin && (
        <CardDouble title="CREATE USER DIRECTLY">
          <Text>Superadmin can create users directly without invite flow.</Text>
          <Input label="USERNAME" name="create_username" value={createUsername} onChange={(event) => setCreateUsername(event.target.value)} placeholder="username" />
          <Input label="PASSWORD" name="create_password" type="password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} placeholder="minimum 8 characters" />

          <Text>ROLE</Text>
          <select value={createRole} onChange={(event) => setCreateRole(event.target.value as AppRole)}>
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {role.toUpperCase()}
              </option>
            ))}
          </select>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={createUser}>{isSaving ? 'Saving...' : 'Create User'}</ActionButton>
            <ActionButton onClick={resetCreateForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>
      )}

      {!isLoading && isSuperadmin && (
        <Card title="USERS">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '20ch' }}>USERNAME</TableColumn>
              <TableColumn style={{ width: '14ch' }}>ROLE</TableColumn>
              <TableColumn style={{ width: '12ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '20ch' }}>RESET PASSWORD</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CREATED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {users.map((user) => {
              const draft = drafts[user.id] || {
                role: user.role,
                isActive: user.is_active,
                password: '',
              };

              return (
                <TableRow key={user.id}>
                  <TableColumn>{user.username}</TableColumn>
                  <TableColumn>
                    <select value={draft.role} onChange={(event) => updateDraft(user.id, (prev) => ({ ...prev, role: event.target.value as AppRole }))}>
                      {APP_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </TableColumn>
                  <TableColumn>
                    <select value={draft.isActive ? 'active' : 'inactive'} onChange={(event) => updateDraft(user.id, (prev) => ({ ...prev, isActive: event.target.value === 'active' }))}>
                      <option value="active">ACTIVE</option>
                      <option value="inactive">INACTIVE</option>
                    </select>
                  </TableColumn>
                  <TableColumn>
                    <Input
                      name={`reset_password_${user.id}`}
                      type="password"
                      placeholder="leave blank"
                      value={draft.password}
                      onChange={(event) => updateDraft(user.id, (prev) => ({ ...prev, password: event.target.value }))}
                    />
                  </TableColumn>
                  <TableColumn>{formatDate(user.created_at)}</TableColumn>
                  <TableColumn>
                    <ActionButton onClick={() => saveUser(user.id)}>Save</ActionButton>
                  </TableColumn>
                </TableRow>
              );
            })}

            {!users.length && (
              <TableRow>
                <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                  No users found.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        </Card>
      )}

      {!isLoading && canInvite && (
        <Card title="INVITE LOG">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '24ch' }}>EMAIL</TableColumn>
              <TableColumn style={{ width: '12ch' }}>ROLE</TableColumn>
              <TableColumn style={{ width: '18ch' }}>EXPIRES</TableColumn>
              <TableColumn style={{ width: '18ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '20ch' }}>INVITED BY</TableColumn>
            </TableRow>

            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableColumn>{invite.email || '—'}</TableColumn>
                <TableColumn>{invite.role.toUpperCase()}</TableColumn>
                <TableColumn>{formatDate(invite.expires_at)}</TableColumn>
                <TableColumn>
                  {invite.accepted_at ? (
                    <span className="status-pill status-pill-success">ACCEPTED</span>
                  ) : new Date(invite.expires_at).getTime() <= Date.now() ? (
                    <span className="status-pill status-pill-warning">EXPIRED</span>
                  ) : (
                    <span className="status-pill status-pill-warning">PENDING</span>
                  )}
                </TableColumn>
                <TableColumn>{invite.invited_by_username || '—'}</TableColumn>
              </TableRow>
            ))}

            {!invites.length && (
              <TableRow>
                <TableColumn colSpan={5} style={{ textAlign: 'center' }}>
                  No invites yet.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        </Card>
      )}
    </AppFrame>
  );
}
