import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <h1>Administrator dashboard</h1>
    <p>Manage user accounts and the global security settings. Ticket content is not available.</p>
    <div class="cards">
      <a routerLink="/admin/users">
        <strong>Users</strong>
        <span>Create accounts, edit access and reset passwords.</span>
      </a>
      <a routerLink="/admin/security">
        <strong>Security settings</strong>
        <span>Configure password rules, expiry and session inactivity.</span>
      </a>
    </div>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 1rem;
    }
    .cards a {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      border: 1px solid #aaa;
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class AdminDashboard {}
