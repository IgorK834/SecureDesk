import { type Permission, READ_TICKETS } from '../../core/auth/auth.models';
import type { AuthService } from '../../core/auth/auth.service';

export interface NavItem {
  label: string;
  route: string;
  /** The role needs this permission (any one of a list) to see the link. */
  permission: Permission | readonly Permission[];
}

// The permission of an item must equal the one `app.routes.ts` requires for its route (checked by
// nav-items.spec.ts), so that no link leads to /forbidden.
// Hiding a link is a courtesy: it protects nothing (see `core/guards/auth.guard.ts`).
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Users', route: '/admin/users', permission: 'users:read' },
  { label: 'Security settings', route: '/admin/security', permission: 'security-settings:read' },
  { label: 'Tickets', route: '/tickets', permission: READ_TICKETS },
  { label: 'New ticket', route: '/tickets/new', permission: 'tickets:create' },
];

/** The links this user may use. Every signed-in user also gets the dashboard link (see MainNav). */
export function visibleNavItems(auth: Pick<AuthService, 'has'>): NavItem[] {
  return NAV_ITEMS.filter((item) => auth.has(item.permission));
}
