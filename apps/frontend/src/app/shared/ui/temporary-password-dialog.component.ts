import { DatePipe } from '@angular/common';
import { Component, ElementRef, ViewChild, signal } from '@angular/core';

export interface TemporaryPasswordDetails {
  login: string;
  /** The plaintext. It lives in this dialog only while it is open, and is dropped on close. */
  password: string;
  /** ISO-8601. */
  expiresAt: string;
}

/**
 * Shows a new temporary password to the administrator exactly once. The server never returns it
 * again, so the dialog cannot be dismissed by accident (Escape is ignored): the administrator
 * must press "I have saved the password". Closing removes the password from the page.
 *
 * It is kept in memory only: never written to storage, a URL or the console.
 */
@Component({
  selector: 'app-temporary-password-dialog',
  imports: [DatePipe],
  template: `
    <dialog
      #dialog
      aria-labelledby="temp-password-title"
      (cancel)="$event.preventDefault()"
      (close)="onClose()"
    >
      @if (details(); as d) {
        <h2 id="temp-password-title">Temporary password</h2>
        <p>
          The account <strong>{{ d.login }}</strong> has been created. Give the user this password
          now: <strong>it is shown only once</strong> and cannot be retrieved later.
        </p>
        <p>
          <output class="password" aria-label="Temporary password">{{ d.password }}</output>
        </p>
        <p>
          Valid until {{ d.expiresAt | date: 'medium' }}. The user must replace it at the first
          sign-in.
        </p>
        <div class="actions">
          <button type="button" (click)="copy(d.password)">Copy password</button>
          <button type="button" autofocus (click)="dialog.close()">
            I have saved the password
          </button>
        </div>
        <p role="status">{{ copyStatus() }}</p>
      }
    </dialog>
  `,
  styles: `
    dialog {
      max-width: 32em;
    }
    .password {
      display: block;
      padding: 0.5em;
      border: 1px solid currentColor;
      font-family: monospace;
      font-size: 1.25em;
      user-select: all;
    }
    .actions {
      display: flex;
      gap: 0.5em;
      justify-content: flex-end;
    }
  `,
})
export class TemporaryPasswordDialogComponent {
  // Static: the <dialog> is always in the template, never inside a conditional block.
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;

  protected readonly details = signal<TemporaryPasswordDetails | null>(null);
  protected readonly copyStatus = signal('');
  private pending: { promise: Promise<void>; settle: () => void } | null = null;

  /** Opens the dialog; resolves once the administrator has confirmed they saved the password. */
  open(details: TemporaryPasswordDetails): Promise<void> {
    if (this.pending) return this.pending.promise;

    this.copyStatus.set('');
    this.details.set(details);
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => (settle = resolve));
    this.pending = { promise, settle };
    this.dialog.nativeElement.showModal();
    return promise;
  }

  protected async copy(password: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(password);
      this.copyStatus.set('Copied to the clipboard.');
    } catch {
      this.copyStatus.set('Could not copy automatically. Select the password and copy it by hand.');
    }
  }

  protected onClose(): void {
    // The plaintext leaves the page here, whichever way the dialog was closed.
    this.details.set(null);
    this.copyStatus.set('');

    const pending = this.pending;
    this.pending = null;
    pending?.settle();
  }
}
