import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { describeApiError } from '../../core/http/api-error';
import { TicketsApiService } from './tickets-api.service';

/** Small plain-text ticket form. The backend fixes creator, status and assignee. */
@Component({
  selector: 'app-ticket-new',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1>Create ticket</h1>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="ticket-title">Title</label>
        <input id="ticket-title" formControlName="title" maxlength="120" />
        @if (message('title'); as text) {
          <p class="error">{{ text }}</p>
        }
      </div>
      <div class="field">
        <label for="ticket-description">Description</label>
        <textarea id="ticket-description" formControlName="description" maxlength="5000"></textarea>
        @if (message('description'); as text) {
          <p class="error">{{ text }}</p>
        }
      </div>
      @if (errorMessage(); as text) {
        <p role="alert" aria-live="assertive" class="error">{{ text }}</p>
      }
      <button type="submit" [disabled]="submitting()">Create ticket</button>
      <a routerLink="/tickets">Cancel</a>
    </form>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      max-width: 38rem;
      margin-block: 1rem;
    }
    textarea {
      min-height: 10rem;
    }
    .error {
      color: #b3261e;
    }
    button {
      margin-inline-end: 0.75rem;
    }
  `,
})
export class TicketNewComponent {
  private readonly api = inject(TicketsApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(5000)]],
  });
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    this.submitted.set(true);
    if (this.submitting() || this.form.invalid) return;
    const value = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api
      .create({ title: value.title.trim(), description: value.description.trim() })
      .subscribe({
        next: (ticket) => {
          this.form.reset();
          void this.router.navigate(['/tickets', ticket.id]);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(
            describeApiError(error).status === 400
              ? 'Check the title and description.'
              : 'Could not create the ticket. Try again.',
          );
        },
      });
  }

  protected message(field: 'title' | 'description'): string | null {
    const control = this.form.controls[field];
    if (!(control.touched || this.submitted()) || !control.errors) return null;
    if (control.hasError('required')) return `Enter a ${field}.`;
    return field === 'title' ? 'Use at most 120 characters.' : 'Use at most 5000 characters.';
  }
}
