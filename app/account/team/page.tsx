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

interface UserEditorDraft {
  id: string;
  username: string;
  role: AppRole;
  isActive: boolean;
  password: string;
}

const navigationItems = APP_NAVIGATION_ITEMS;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return day + '/' + month + '/' + year + ' ' + hours + ':' + minutes;
}

export default function TeamAccessPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentSessionUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [editingUser, setEditingUser] = useState<UserEditorDraft | null>(null);

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

    return `${currentUser.effectiveRole.toUpperCase()} ACCESS`;
  }, [currentUser]);

  function resetCreateForm() {
    setCreateUsername('');
    setCreatePassword('');
    setCreateRole('standard');
  }

  function syncEditingUser(rows: ManagedUser[]) {
    setEditingUser((prev) => {
      if (!prev) {
        return null;
      }

      const match = rows.find((row) => row.id === prev.id);
      if (!match) {
        return null;
      }

      return {
        ...prev,
        username: match.username,
        role: match.role,
        isActive: match.is_active,
      };
    });
  }

  function startEditingUser(user: ManagedUser) {
    setEditingUser({
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.is_active,
      password: '',
    });
  }

  function cancelEditingUser() {
    setEditingUser(null);
  }

  function updateEditingUser(updater: (draft: UserEditorDraft) => UserEditorDraft) {
    setEditingUser((prev) => {
      if (!prev) {
        return null;
      }

      return updater(prev);
    });
  }

  async function loadUsers() {
    if (!isSuperadmin) {
      setUsers([]);
      setEditingUser(null);
      return;
    }

    const response = await fetch('/api/users', { cache: 'no-store' });
    const data = (await response.json().catch(() => null)) as { users?: ManagedUser[]; error?: string } | null;

    if (!response.ok) {
      throw new Error(data?.error || 'Unable to load users.');
    }

    const loadedUsers = data?.users || [];
    setUsers(loadedUsers);
    syncEditingUser(loadedUsers);
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
        syncEditingUser(loadedUsers);
      } else {
        setUsers([]);
        setEditingUser(null);
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
      setError(loadError?.message || 'Unable to load team access.');
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

  async function saveEditedUser() {
    if (!isSuperadmin || !editingUser) {
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
          id: editingUser.id,
          username: editingUser.username,
          role: editingUser.role,
          isActive: editingUser.isActive,
          password: editingUser.password || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to update user.');
      }

      await loadUsers();
      setEditingUser(null);
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to update user.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="TEAM ACCESS"
      navRight={<ActionButton onClick={() => router.push('/account')}>BACK TO USER SETTINGS</ActionButton>}
      heading="TEAM ACCESS"
      badge={badgeText}
      sidebarWidthCh={52}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {error ? (
            <Card title="ERROR">
              <Text>
                <span className="status-error">{error}</span>
              </Text>
            </Card>
          ) : null}

          {isLoading ? (
            <Card title="LOADING">
              <Text>Loading team access...</Text>
            </Card>
          ) : null}

          {!isLoading && !canInvite && !isSuperadmin ? (
            <Card title="NO ACCESS">
              <Text>
                <span className="status-warning">You do not have permission to manage team access.</span>
              </Text>
            </Card>
          ) : null}

          {!isLoading && canInvite ? (
            <CardDouble title="INVITE TEAMMATES">
              <Text>Admins and superadmins can generate one-time join links from this page.</Text>
              <Input label="EMAIL (OPTIONAL)" name="invite_email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@company.com" />
              <Input label="EXPIRES IN HOURS" name="expires_hours" type="number" value={inviteHours} onChange={(event) => setInviteHours(event.target.value)} />

              <Text>INVITED ROLE</Text>
              <select value={isSuperadmin ? inviteRole : 'standard'} onChange={(event) => setInviteRole(event.target.value as AppRole)} disabled={!isSuperadmin}>
                <option value="standard">STANDARD</option>
                <option value="readonly">READONLY</option>
                {isSuperadmin ? <option value="admin">ADMIN</option> : null}
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
          ) : null}

          {!isLoading && isSuperadmin ? (
            <CardDouble title="CREATE USER">
              <Text>Superadmins can create users directly or reset credentials from here.</Text>
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
          ) : null}

          {!isLoading && isSuperadmin && editingUser ? (
            <CardDouble title={`EDIT USER — ${editingUser.username.toUpperCase()}`}>
              <Text>Update role, status, username, and password from this panel.</Text>
              <Input
                label="USERNAME"
                name="edit_username"
                value={editingUser.username}
                onChange={(event) => updateEditingUser((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="username"
              />

              <Text>ROLE</Text>
              <select value={editingUser.role} onChange={(event) => updateEditingUser((prev) => ({ ...prev, role: event.target.value as AppRole }))}>
                {APP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </select>

              <Text>STATUS</Text>
              <select value={editingUser.isActive ? 'active' : 'inactive'} onChange={(event) => updateEditingUser((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}>
                <option value="active">ACTIVE</option>
                <option value="inactive">INACTIVE</option>
              </select>

              <Input
                label="RESET PASSWORD (OPTIONAL)"
                name="edit_password"
                type="password"
                placeholder="leave blank"
                value={editingUser.password}
                onChange={(event) => updateEditingUser((prev) => ({ ...prev, password: event.target.value }))}
              />

              <RowSpaceBetween>
                <ActionButton onClick={saveEditedUser}>{isSaving ? 'Saving...' : 'Save Changes'}</ActionButton>
                <ActionButton onClick={cancelEditingUser}>Cancel</ActionButton>
              </RowSpaceBetween>
            </CardDouble>
          ) : null}
        </>
      }
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reload',
          onClick: loadAll,
        },
        {
          hotkey: '⌘+B',
          body: 'Account',
          onClick: () => router.push('/account'),
        },
      ]}
    >
      {!isLoading && isSuperadmin ? (
        <Card title="TEAM MEMBERS">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '24ch' }}>USERNAME</TableColumn>
              <TableColumn style={{ width: '14ch' }}>ROLE</TableColumn>
              <TableColumn style={{ width: '12ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '18ch', whiteSpace: 'nowrap' }}>CREATED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {users.map((user) => (
              <TableRow key={user.id}>
                <TableColumn>{user.username}</TableColumn>
                <TableColumn>{user.role.toUpperCase()}</TableColumn>
                <TableColumn>
                  {user.is_active ? <span className="status-pill status-pill-success">ACTIVE</span> : <span className="status-pill status-pill-warning">INACTIVE</span>}
                </TableColumn>
                <TableColumn style={{ whiteSpace: 'nowrap' }}>{formatDate(user.created_at)}</TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => startEditingUser(user)}>{editingUser?.id === user.id ? 'Editing...' : 'Edit'}</ActionButton>
                </TableColumn>
              </TableRow>
            ))}

            {!users.length ? (
              <TableRow>
                <TableColumn colSpan={5} style={{ textAlign: 'center' }}>
                  No users found.
                </TableColumn>
              </TableRow>
            ) : null}
          </Table>
        </Card>
      ) : null}

      {!isLoading && canInvite ? (
        <Card title="INVITE HISTORY">
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

            {!invites.length ? (
              <TableRow>
                <TableColumn colSpan={5} style={{ textAlign: 'center' }}>
                  No invites yet.
                </TableColumn>
              </TableRow>
            ) : null}
          </Table>
        </Card>
      ) : null}
    </AppFrame>
  );
}
