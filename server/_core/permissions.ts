/**
 * Permissions System — Role-Based Access Control for Merchant Teams
 * 
 * Defines 4 role templates with granular permission checks:
 * - owner: Full control (cannot be removed)
 * - manager: Everything except subscription & owner management
 * - sales_supervisor: Customer-facing operations (conversations, products, orders)
 * - viewer: Read-only access to everything
 * 
 * Usage:
 *   import { hasPermission } from './permissions';
 *   if (!hasPermission(memberRole, 'bot_settings.manage')) throw FORBIDDEN;
 */

// ═══════════════════════════════════════════════════════════════
// Role & Permission Types
// ═══════════════════════════════════════════════════════════════

export type MerchantRole = 'owner' | 'manager' | 'sales_supervisor' | 'viewer';

export type Permission =
  | 'conversations.read'
  | 'conversations.reply'
  | 'products.manage'
  | 'customers.manage'
  | 'orders.manage'
  | 'analytics.read'
  | 'campaigns.manage'
  | 'bot_settings.manage'
  | 'virtual_agents.manage'
  | 'whatsapp.manage'
  | 'integrations.manage'
  | 'team.manage'
  | 'team.add_owner'
  | 'subscription.manage'
  | 'settings.manage';

// ═══════════════════════════════════════════════════════════════
// Role Templates
// ═══════════════════════════════════════════════════════════════

const ROLE_PERMISSIONS: Record<MerchantRole, readonly Permission[]> = {
  owner: [
    'conversations.read', 'conversations.reply',
    'products.manage', 'customers.manage', 'orders.manage',
    'analytics.read', 'campaigns.manage',
    'bot_settings.manage', 'virtual_agents.manage',
    'whatsapp.manage', 'integrations.manage',
    'team.manage', 'team.add_owner',
    'subscription.manage', 'settings.manage',
  ],
  manager: [
    'conversations.read', 'conversations.reply',
    'products.manage', 'customers.manage', 'orders.manage',
    'analytics.read', 'campaigns.manage',
    'bot_settings.manage', 'virtual_agents.manage',
    'whatsapp.manage', 'integrations.manage',
    'team.manage', 'settings.manage',
  ],
  sales_supervisor: [
    'conversations.read', 'conversations.reply',
    'products.manage', 'customers.manage', 'orders.manage',
    'analytics.read',
  ],
  viewer: [
    'conversations.read',
    'analytics.read',
  ],
} as const;

// ═══════════════════════════════════════════════════════════════
// Permission Check Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: MerchantRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: MerchantRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Get role display info (Arabic labels for UI).
 */
export function getRoleInfo(role: MerchantRole): { label: string; description: string; color: string } {
  switch (role) {
    case 'owner':
      return { label: 'مالك المتجر', description: 'تحكم كامل بجميع الإعدادات والأعضاء', color: 'destructive' };
    case 'manager':
      return { label: 'مدير', description: 'كل شيء عدا إدارة الاشتراك وإضافة مالكين', color: 'default' };
    case 'sales_supervisor':
      return { label: 'مشرف مبيعات', description: 'المحادثات، العملاء، المنتجات، والتقارير', color: 'secondary' };
    case 'viewer':
      return { label: 'مشاهد', description: 'عرض فقط — بدون تعديل', color: 'outline' };
  }
}

/**
 * All available roles (for UI dropdowns).
 */
export const ALL_ROLES: MerchantRole[] = ['owner', 'manager', 'sales_supervisor', 'viewer'];

/**
 * Roles that can be assigned via invitation (owner can only be set by existing owner).
 */
export const INVITABLE_ROLES: MerchantRole[] = ['manager', 'sales_supervisor', 'viewer'];
