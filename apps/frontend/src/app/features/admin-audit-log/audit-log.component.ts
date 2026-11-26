import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, DOCUMENT, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, type Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdminApi,
  type AuditEntry,
  type AuditExportFormat,
  type AuditFilters,
  type AuditOutcome,
} from '../../core/http/admin-api.service';

@Component({
  selector: 'app-audit-log',
  imports: [DatePipe, JsonPipe, ReactiveFormsModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    user: ['', Validators.maxLength(128)],
    from: '',
    to: '',
    action: '',
    outcome: this.formBuilder.control<AuditOutcome | ''>(''),
  });

  protected readonly entries = signal<AuditEntry[]>([]);
  protected readonly actions = signal<string[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly pageSize = 20;
  protected readonly filterError = signal('');
  protected readonly exportError = signal('');
  protected readonly exporting = signal(false);
  protected readonly selected = signal<AuditEntry | null>(null);
  protected readonly detailError = signal(false);

  private filters: AuditFilters = {};
  private listRequest?: Subscription;
  private detailRequest?: Subscription;

  ngOnInit(): void {
    this.load();
  }

  protected applyFilters(): void {
    this.filterError.set('');
    if (this.form.invalid) {
      this.filterError.set('Enter at most 128 characters for the user filter.');
      return;
    }
    const { user, action, outcome, from, to } = this.form.getRawValue();
    const start = from ? new Date(from + 'Z') : null;
    const end = to ? new Date(to + 'Z') : null;
    if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
      this.filterError.set('Enter valid UTC dates.');
      return;
    }
    if (start && end && start > end) {
      this.filterError.set('The start time must be before or equal to the end time.');
      return;
    }
    this.filters = {
      ...(user.trim() && { user: user.trim() }),
      ...(action && { action: [action] }),
      ...(outcome && { outcome }),
      ...(start && { from: start.toISOString() }),
      ...(end && { to: end.toISOString() }),
    };
    this.page.set(1);
    this.load();
  }

  protected load(): void {
    this.listRequest?.unsubscribe();
    this.state.set('loading');
    this.listRequest = this.api
      .listAuditEntries(this.filters, this.page(), this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.entries.set(result.items);
          this.actions.set(result.actions);
          this.total.set(result.total);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  protected changePage(offset: number): void {
    const page = this.page() + offset;
    if (page < 1 || (page - 1) * this.pageSize >= this.total()) return;
    this.page.set(page);
    this.load();
  }

  protected openEntry(seq: number, drawer: HTMLDialogElement): void {
    this.detailRequest?.unsubscribe();
    this.selected.set(null);
    this.detailError.set(false);
    drawer.showModal();
    this.detailRequest = this.api
      .getAuditEntry(seq)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => this.selected.set(entry),
        error: () => this.detailError.set(true),
      });
  }

  protected clearDetail(): void {
    this.detailRequest?.unsubscribe();
    this.selected.set(null);
  }

  protected export(format: AuditExportFormat): void {
    if (this.exporting()) return;
    this.exportError.set('');
    this.exporting.set(true);
    this.api
      .exportAuditEntries(this.filters, format)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exporting.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.body) {
            this.exportError.set('Could not download the audit log.');
            return;
          }
          const disposition = response.headers.get('Content-Disposition') ?? '';
          const filename = /(?:^|;\s*)filename="([^"\\/\r\n]+)"/i.exec(disposition)?.[1];
          const link = this.document.createElement('a');
          const url = URL.createObjectURL(response.body);
          link.href = url;
          link.download = filename ?? 'audit-log.' + format;
          this.document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url));
        },
        error: (error: unknown) => void this.showExportError(error),
      });
  }

  private async showExportError(error: unknown): Promise<void> {
    let message = 'Could not download the audit log. Try again.';
    if (error instanceof HttpErrorResponse && error.status === 400 && error.error instanceof Blob) {
      try {
        const body = JSON.parse(await error.error.text()) as { error?: { code?: string } };
        if (body.error?.code === 'EXPORT_TOO_LARGE')
          message = 'Too many entries to export. Narrow the filters.';
      } catch {
        // The generic English message also covers invalid or missing responses.
      }
    }
    this.exportError.set(message);
  }
}
