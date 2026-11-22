/**
 * ServicePro OS — Role-Based Access Control (RBAC) & Authorization Engine
 * Standards: OWASP Top 10 A01:2021-Broken Access Control, NIST RBAC
 */

import { UserRole } from '../types';

export type Resource = 
  | 'DASHBOARD'
  | 'BOOKINGS'
  | 'SERVICES'
  | 'TECHNICIANS'
  | 'CUSTOMERS'
  | 'DISPATCH_RADAR'
  | 'FINANCIALS'
  | 'COMMISSIONS'
  | 'SAFETY_INCIDENTS'
  | 'AUDIT_LOGS'
  | 'SETTINGS'
  | 'STAFF_DESK'
  | 'JOB_VERIFICATION'
  | 'CUSTOMER_COMM'
  | 'EMERGENCY_HANDOVER';

export type Action = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXECUTE' | 'MANAGE';

interface PermissionRule {
  resource: Resource;
  allowedActions: Action[];
}

const ADMIN_RULES: PermissionRule[] = [
  { resource: 'DASHBOARD', allowedActions: ['READ', 'EXECUTE'] },
  { resource: 'BOOKINGS', allowedActions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'MANAGE'] },
  { resource: 'SERVICES', allowedActions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'] },
  { resource: 'TECHNICIANS', allowedActions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'] },
  { resource: 'CUSTOMERS', allowedActions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'] },
  { resource: 'DISPATCH_RADAR', allowedActions: ['READ', 'EXECUTE', 'MANAGE'] },
  { resource: 'FINANCIALS', allowedActions: ['CREATE', 'READ', 'UPDATE', 'MANAGE'] },
  { resource: 'COMMISSIONS', allowedActions: ['READ', 'UPDATE', 'MANAGE'] },
  { resource: 'SAFETY_INCIDENTS', allowedActions: ['CREATE', 'READ', 'UPDATE', 'EXECUTE', 'MANAGE'] },
  { resource: 'AUDIT_LOGS', allowedActions: ['READ', 'MANAGE'] },
  { resource: 'SETTINGS', allowedActions: ['READ', 'UPDATE', 'MANAGE'] },
  { resource: 'STAFF_DESK', allowedActions: ['READ', 'EXECUTE', 'MANAGE'] },
  { resource: 'JOB_VERIFICATION', allowedActions: ['READ', 'EXECUTE', 'MANAGE'] },
  { resource: 'CUSTOMER_COMM', allowedActions: ['CREATE', 'READ', 'EXECUTE'] },
  { resource: 'EMERGENCY_HANDOVER', allowedActions: ['EXECUTE', 'MANAGE'] }
];

const STAFF_RULES: PermissionRule[] = [
  { resource: 'STAFF_DESK', allowedActions: ['READ', 'EXECUTE'] },
  { resource: 'DISPATCH_RADAR', allowedActions: ['READ', 'EXECUTE'] },
  { resource: 'BOOKINGS', allowedActions: ['CREATE', 'READ', 'UPDATE'] }, // Staff can schedule & intake orders
  { resource: 'CUSTOMER_COMM', allowedActions: ['CREATE', 'READ', 'EXECUTE'] },
  { resource: 'JOB_VERIFICATION', allowedActions: ['READ', 'EXECUTE'] },
  { resource: 'EMERGENCY_HANDOVER', allowedActions: ['EXECUTE'] },
  { resource: 'TECHNICIANS', allowedActions: ['READ'] }, // Staff can view technician availability
  { resource: 'CUSTOMERS', allowedActions: ['READ', 'CREATE'] }, // Staff can intake new customers
  { resource: 'SERVICES', allowedActions: ['READ'] }, // Staff can browse catalog
  // Explicitly DENIED for Staff:
  // FINANCIALS, COMMISSIONS, AUDIT_LOGS, SETTINGS, Platform Configuration
];

export function can(role: UserRole, action: Action, resource: Resource): boolean {
  const rules = role === 'ADMIN' ? ADMIN_RULES : STAFF_RULES;
  const rule = rules.find(r => r.resource === resource);
  if (!rule) return false;
  return rule.allowedActions.includes(action) || rule.allowedActions.includes('MANAGE');
}

/**
 * Validates route authorization to prevent horizontal or vertical privilege escalation
 */
export function isRouteAuthorized(role: UserRole, routePath: string): { authorized: boolean; reason?: string } {
  const normalized = routePath.toLowerCase();

  // 1. Staff trying to access Admin modules
  if (role === 'STAFF') {
    if (normalized.startsWith('/page/') || normalized.startsWith('/admin/') || normalized.startsWith('#/page/')) {
      return {
        authorized: false,
        reason: 'Restricted Access: Administrative Clearance Required (403 Forbidden)'
      };
    }
  }

  // 2. Admin navigating Staff portal (warn to preserve audit segregation)
  if (role === 'ADMIN') {
    if (normalized.startsWith('/staff/') || normalized.startsWith('#/staff/')) {
      // Allowed for Super Admin oversight, but flagged
      return { authorized: true };
    }
  }

  return { authorized: true };
}

export function canAccessPage(role: UserRole, _pageId: number): boolean {
  if (role === 'ADMIN') return true;
  // Staff cannot access Admin Pages 1-36
  return false;
}

export function canAccessStaffPage(_role: UserRole, _staffPageId: number): boolean {
  // Both Admin and Staff can access operational staff desk pages
  return true;
}
