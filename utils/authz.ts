export const APP_ROLES = ['superadmin', 'admin', 'standard', 'readonly'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AppPermission =
  | 'quotes:read'
  | 'quotes:write'
  | 'orders:read'
  | 'orders:write'
  | 'master_data:read'
  | 'master_data:write'
  | 'pricing:read'
  | 'pricing:write'
  | 'billing:read'
  | 'billing:write'
  | 'users:read'
  | 'users:write'
  | 'users:invite';

const SUPERADMIN_PERMISSIONS: AppPermission[] = [
  'quotes:read',
  'quotes:write',
  'orders:read',
  'orders:write',
  'master_data:read',
  'master_data:write',
  'pricing:read',
  'pricing:write',
  'billing:read',
  'billing:write',
  'users:read',
  'users:write',
  'users:invite',
];

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  superadmin: SUPERADMIN_PERMISSIONS,
  admin: [
    'quotes:read',
    'quotes:write',
    'orders:read',
    'orders:write',
    'master_data:read',
    'master_data:write',
    'pricing:read',
    'pricing:write',
    'billing:read',
    'billing:write',
    'users:invite',
  ],
  standard: ['quotes:read', 'quotes:write', 'orders:read', 'orders:write', 'master_data:read'],
  readonly: ['quotes:read', 'orders:read', 'master_data:read'],
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function normalizeAppRole(value: unknown, fallback: AppRole = 'readonly'): AppRole {
  if (isAppRole(value)) {
    return value;
  }
  return fallback;
}

export function getRolePermissions(role: AppRole): AppPermission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function roleHasPermission(role: AppRole, permission: AppPermission): boolean {
  return getRolePermissions(role).includes(permission);
}

export function isRoleAtLeastAdmin(role: AppRole): boolean {
  return role === 'superadmin' || role === 'admin';
}
