import { Component, ElementRef, ViewChild, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words: the consequence, not a generic "Are you sure?". */
  message: string;
  confirmLabel: string;
}

/**
 * Asks for an explicit confirmation before a consequential action, in a native modal `<dialog>`
 * (focus is trapped, the page behind is inert and Escape cancels, all by the browser).
 *
 * ```ts
 * if (await this.confirm.open({ title, message, confirmLabel })) { ...do it... }
 * ```
 *
 * "Cancel" is the first control, so it is what the keyboard lands on: Enter or Space cannot
 * confirm by accident. Escape and Cancel both resolve to `false`.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog
      #dialog
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      (close)="onClose()"
    >
      @if (options(); as o) {
        <h2 id="confirm-dialog-title">{{ o.title }}</h2>
        <p id="confirm-dialog-message">{{ o.message }}</p>
        <div class="actions">
          <button type="button" autofocus (click)="dialog.close('cancel')">Cancel</button>
          <button type="button" class="confirm" (click)="dialog.close('confirm')">
            {{ o.confirmLabel }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog {
      max-width: 32em;
    }
    .actions {
      display: flex;
      gap: 0.5em;
      justify-content: flex-end;
    }
  `,
})
export class ConfirmDialogComponent {
  // Static: the <dialog> is always in the template, never inside a conditional block.
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;

  protected readonly options = signal<ConfirmOptions | null>(null);
  private pending: { promise: Promise<boolean>; settle: (confirmed: boolean) => void } | null =
    null;

  /** Opens the dialog; resolves `true` only if the user pressed the confirm button. */
  open(options: ConfirmOptions): Promise<boolean> {
    // Asking again while a question is open keeps that question (and its single answer).
    if (this.pending) return this.pending.promise;

    this.options.set(options);
    let settle!: (confirmed: boolean) => void;
    const promise = new Promise<boolean>((resolve) => (settle = resolve));
    this.pending = { promise, settle };
    this.dialog.nativeElement.showModal();
    return promise;
  }

  protected onClose(): void {
    const dialog = this.dialog.nativeElement;
    const confirmed = dialog.returnValue === 'confirm';
    dialog.returnValue = '';
    this.options.set(null);

    const pending = this.pending;
    this.pending = null;
    pending?.settle(confirmed);
  }
}
