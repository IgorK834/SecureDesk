import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Stand-in for the routes whose real page belongs to a later task (login SD-21, password
 * changes SD-22/SD-23, administration SD-24, tickets SD-25). Each of those tasks replaces the
 * `loadComponent` of its routes in `app.routes.ts`; the route's `title` is shown here.
 */
@Component({
  selector: 'app-placeholder',
  template: `
    <h1>{{ title }}</h1>
    <p>This page is not available yet.</p>
  `,
})
export class Placeholder {
  protected readonly title = inject(ActivatedRoute).snapshot.title;
}
