import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Shown when the role may not use a page (route guard) or the server answered 403. */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  template: `
    <h1>Access denied</h1>
    <p>Your account is not allowed to use this page.</p>
    <a routerLink="/dashboard">Back to the dashboard</a>
  `,
})
export class Forbidden {}
