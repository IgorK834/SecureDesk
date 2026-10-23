import type { Route, Routes } from '@angular/router';
import { READ_TICKETS } from './core/auth/auth.models';
import { authGuard } from './core/guards/auth.guard';
import { guestOnlyGuard } from './core/guards/guest-only.guard';
import { type PermissionRouteData, permissionGuard } from './core/guards/permission.guard';

// The page inventory of backlog section 11.1. Every route except /login sits behind `authGuard`
// (so a session that owes a password change is sent to that page from everywhere, including
// unknown URLs); pages for a role also declare the permission it needs. All of this is UX: the
// backend authorizes every API call itself (see `core/guards/auth.guard.ts`).

const placeholder = () => import('./features/placeholder/placeholder').then((m) => m.Placeholder);

/** Signed in and holding the permission (any one of a list). */
const requires = (
  permission: PermissionRouteData['permission'],
): Pick<Route, 'canActivate' | 'data'> => ({
  canActivate: [authGuard, permissionGuard],
  data: { permission } satisfies PermissionRouteData,
});

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestOnlyGuard],
    loadComponent: placeholder,
  },
  {
    path: 'change-initial-password',
    title: 'Set your password',
    canActivate: [authGuard],
    loadComponent: placeholder,
  },
  {
    path: 'dashboard',
    title: 'Dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'account/change-password',
    title: 'Change password',
    canActivate: [authGuard],
    loadComponent: placeholder,
  },
  {
    path: 'admin/users',
    title: 'Users',
    ...requires('users:read'),
    loadComponent: () =>
      import('./features/admin-users/users-list.component').then((m) => m.UsersListComponent),
  },
  {
    path: 'admin/users/new',
    title: 'New user',
    ...requires('users:create'),
    loadComponent: () =>
      import('./features/admin-users/user-form.component').then((m) => m.UserFormComponent),
  },
  {
    path: 'admin/users/:id',
    title: 'User account',
    ...requires('users:read'),
    loadComponent: () =>
      import('./features/admin-users/user-detail.component').then((m) => m.UserDetailComponent),
  },
  {
    path: 'admin/security',
    title: 'Security settings',
    ...requires('security-settings:read'),
    loadComponent: () =>
      import('./features/admin-security/security-settings.component').then(
        (m) => m.SecuritySettingsComponent,
      ),
  },
  { path: 'tickets', title: 'Tickets', ...requires(READ_TICKETS), loadComponent: placeholder },
  {
    path: 'tickets/new',
    title: 'New ticket',
    ...requires('tickets:create'),
    loadComponent: placeholder,
  },
  {
    path: 'tickets/:id',
    title: 'Ticket',
    ...requires(READ_TICKETS),
    loadComponent: placeholder,
  },
  {
    path: 'forbidden',
    title: 'Access denied',
    canActivate: [authGuard],
    loadComponent: () => import('./features/forbidden/forbidden').then((m) => m.Forbidden),
  },
  {
    path: '**',
    title: 'Page not found',
    canActivate: [authGuard],
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
