import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Unknown URL, or an object the server answered 404 for. The text must not tell the two apart:
 * the server answers 404 for tickets the caller may not read, so that their existence stays secret.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>This page does not exist, or you are not allowed to see it.</p>
    <a routerLink="/dashboard">Back to the dashboard</a>
  `,
})
export class NotFound {}
