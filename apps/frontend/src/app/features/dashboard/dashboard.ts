import { NgComponentOutlet } from '@angular/common';
import { Component, type Type, computed, inject } from '@angular/core';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDashboard } from './admin-dashboard';
import { EmployeeDashboard } from './employee-dashboard';
import { GuestDashboard } from './guest-dashboard';
import { ManagerDashboard } from './manager-dashboard';

// A Record over every Role: adding a role without giving it a dashboard does not compile.
const DASHBOARDS: Record<Role, Type<unknown>> = {
  ADMINISTRATOR: AdminDashboard,
  MANAGER: ManagerDashboard,
  EMPLOYEE: EmployeeDashboard,
  GUEST: GuestDashboard,
};

/** The /dashboard page: shows the shell that belongs to the signed-in user's role. */
@Component({
  selector: 'app-dashboard',
  imports: [NgComponentOutlet],
  template: `<ng-container [ngComponentOutlet]="shell()" />`,
})
export class Dashboard {
  private readonly auth = inject(AuthService);

  protected readonly shell = computed(() => {
    const user = this.auth.user();
    return user ? DASHBOARDS[user.role] : null;
  });
}
