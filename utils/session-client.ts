import { AppPermission, AppRole } from '@utils/authz';
import { ThemePreferences } from '@utils/theme-preferences';

export interface CurrentSessionUser {
  id: string;
  username: string;
  role: AppRole;
  effectiveRole: AppRole;
  assumedRole: AppRole | null;
  themePreferences: ThemePreferences;
  permissions: AppPermission[];
  basePermissions: AppPermission[];
  canOverrideSessionRole: boolean;
}

interface MeApiResponse {
  user?: CurrentSessionUser;
  error?: string;
}

export async function fetchCurrentSessionUser(): Promise<CurrentSessionUser | null> {
  const response = await fetch('/api/me', {
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  const data = ((await response.json().catch(() => ({}))) || {}) as MeApiResponse;
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Unable to load current session user.');
  }

  return data.user;
}

export function userCan(user: CurrentSessionUser | null, permission: AppPermission): boolean {
  return Boolean(user?.permissions?.includes(permission));
}
