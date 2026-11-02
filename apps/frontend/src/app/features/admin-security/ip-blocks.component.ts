import { DatePipe } from '@angular/common';
import { Component, ViewChild, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type IpBlock } from '../../core/http/admin-api.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { actionErrorMessage } from '../admin-users/error-messages';

type BlocksState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error' };

@Component({
  selector: 'app-ip-blocks',
  imports: [DatePipe, ConfirmDialogComponent],
  template: `
    <h1>Address blocks</h1>
    <p>
      Addresses are blocked after too many failed authentication attempts in the 15-minute window.
      Clearing a block starts its address counter from zero.
    </p>

    @if (notice(); as text) {
      <p role="status" aria-live="polite">{{ text }}</p>
    }
    @if (actionError(); as text) {
      <p role="alert" aria-live="assertive" class="error">{{ text }}</p>
    }

    @switch (state().kind) {
      @case ('loading') {
        <p role="status">Loading address blocks…</p>
      }
      @case ('error') {
        <div role="alert">
          <p>Could not load address blocks.</p>
          <button type="button" (click)="load()">Try again</button>
        </div>
      }
      @case ('ready') {
        @if (items().length === 0) {
          <p role="status">No addresses are blocked.</p>
        } @else {
          <table>
            <caption class="visually-hidden">
              Blocked addresses
            </caption>
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col">Failed attempts</th>
                <th scope="col">Blocked until</th>
                @if (auth.has('ip-blocks:clear')) {
                  <th scope="col">Action</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (block of items(); track block.ipKey) {
                <tr>
                  <td>{{ block.ipKey }}</td>
                  <td>{{ block.failedAttempts }}</td>
                  <td>{{ block.lockedUntil | date: 'medium' }}</td>
                  @if (auth.has('ip-blocks:clear')) {
                    <td>
                      <button type="button" [disabled]="busy()" (click)="clear(block)">
                        Clear
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      }
    }
    <app-confirm-dialog />
  `,
  styles: `
    table {
      border-collapse: collapse;
    }
    th,
    td {
      padding: 0.25em 0.75em;
      text-align: left;
    }
    .error {
      color: #b3261e;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class IpBlocksComponent {
  private readonly api = inject(AdminApi);
  protected readonly auth = inject(AuthService);
  @ViewChild(ConfirmDialogComponent, { static: true }) private confirm!: ConfirmDialogComponent;

  protected readonly state = signal<BlocksState>({ kind: 'loading' });
  protected readonly items = signal<IpBlock[]>([]);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set({ kind: 'loading' });
    this.api.listIpBlocks().subscribe({
      next: ({ items }) => {
        this.items.set(items);
        this.state.set({ kind: 'ready' });
      },
      error: () => this.state.set({ kind: 'error' }),
    });
  }

  protected async clear(block: IpBlock): Promise<void> {
    const confirmed = await this.confirm.open({
      title: 'Clear this address block?',
      message: `${block.ipKey} will be able to attempt sign-in immediately and its address counter will start from zero.`,
      confirmLabel: 'Clear block',
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    this.api.clearIpBlock(block.ipKey).subscribe({
      next: () => {
        this.busy.set(false);
        this.items.update((items) => items.filter((item) => item.ipKey !== block.ipKey));
        this.notice.set(`Address block ${block.ipKey} cleared.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(actionErrorMessage(error));
      },
    });
  }
}
