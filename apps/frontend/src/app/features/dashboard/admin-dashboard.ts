import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <h1>Administrator dashboard</h1>
    <p class="dashboard-intro">
      Manage user accounts and the global security settings. Ticket content is not available.
    </p>
    <div class="cards">
      <a routerLink="/admin/users">
        <strong>Users</strong>
        <span>Create accounts, edit access and reset passwords.</span>
      </a>
      <a routerLink="/admin/security">
        <strong>Security settings</strong>
        <span>Configure password rules, expiry and session inactivity.</span>
      </a>
      <a routerLink="/admin/security-events">
        <strong>Security events</strong>
        <span>Review alerts, acknowledge incidents and test honeytokens.</span>
      </a>
    </div>
  `,
})
export class AdminDashboard {}
