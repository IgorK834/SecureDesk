import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdminApi,
  type HoneytokenStatus,
  type SecurityEvent,
  type SecurityEventQuery,
  type SecurityEventSeverity,
} from '../../core/http/admin-api.service';
import { SecurityAlertService } from '../../shared/layout/security-alert.service';

type LoadState = 'loading' | 'ready' | 'error';

const EVENT_TYPES = [
  'ACCOUNT_LOCKED',
  'LOGIN_IP_BLOCKED',
  'CAPTCHA_FAILED',
  'CAPTCHA_PROVIDER_ERROR',
  'HONEYPOT_TRIGGERED',
  'HONEYTOKEN_TRIGGERED',
  'HONEYTOKEN_TESTED',
  'DECOY_RESOURCE_ACCESSED',
  'PASSWORD_SPRAYING_SUSPECTED',
  'CHANGE_PASSWORD_BRUTE_FORCE',
  'ACCOUNT_UNLOCKED_BY_ADMIN',
  'IP_BLOCK_CLEARED_BY_ADMIN',
  'SECURITY_SETTINGS_CHANGED',
] as const;

@Component({
  selector: 'app-security-events',
  imports: [DatePipe, JsonPipe, FormsModule],
  template: `
    <h1>Security events</h1>
    <p>Review retained security signals and acknowledge incidents that have been handled.</p>

    <form (ngSubmit)="applyFilters()">
      <label>
        Type
        <select name="type" [(ngModel)]="typeFilter">
          <option value="">All types</option>
          @for (type of eventTypes; track type) {
            <option [value]="type">{{ type }}</option>
          }
        </select>
      </label>
      <label>
        Severity
        <select name="severity" [(ngModel)]="severityFilter">
          <option value="">All severities</option>
          <option value="INFO">Info</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </label>
      <label>
        Acknowledgement
        <select name="acknowledged" [(ngModel)]="acknowledgedFilter">
          <option value="">All</option>
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
        </select>
      </label>
      <label>
        From
        <input name="from" type="datetime-local" [(ngModel)]="fromFilter" />
      </label>
      <label>
        To
        <input name="to" type="datetime-local" [(ngModel)]="toFilter" />
      </label>
      <button type="submit">Apply filters</button>
    </form>

    @if (notice(); as text) {
      <p role="status" aria-live="polite">{{ text }}</p>
    }
    @switch (state()) {
      @case ('loading') {
        <p role="status">Loading security events…</p>
      }
      @case ('error') {
        <div role="alert">
          <p>Could not load security events.</p>
          <button type="button" (click)="loadEvents()">Try again</button>
        </div>
      }
      @case ('ready') {
        @if (events().length === 0) {
          <p role="status">No security events match these filters.</p>
        } @else {
          <table>
            <caption class="visually-hidden">
              Security events, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Severity</th>
                <th scope="col">Type and details</th>
                <th scope="col">Address</th>
                <th scope="col">Status</th>
                @if (auth.has('security-events:acknowledge')) {
                  <th scope="col">Action</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.id) {
                <tr>
                  <td>{{ event.occurredAt | date: 'medium' }}</td>
                  <td>
                    <span class="badge" [class]="event.severity.toLowerCase()">{{
                      event.severity
                    }}</span>
                  </td>
                  <td>
                    <strong>{{ event.type }}</strong>
                    <pre>{{ event.details | json }}</pre>
                  </td>
                  <td>{{ event.ipKey ?? '—' }}</td>
                  <td>{{ event.acknowledgedAt ? 'Acknowledged' : 'Open' }}</td>
                  @if (auth.has('security-events:acknowledge')) {
                    <td>
                      @if (!event.acknowledgedAt) {
                        <button
                          type="button"
                          [disabled]="busyEventIds().has(event.id)"
                          (click)="acknowledge(event)"
                        >
                          Acknowledge
                        </button>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
          <p>{{ total() }} matching event(s).</p>
          <div class="pager">
            <button type="button" [disabled]="page() === 1" (click)="changePage(-1)">
              Previous
            </button>
            <span>Page {{ page() }}</span>
            <button type="button" [disabled]="page() * pageSize >= total()" (click)="changePage(1)">
              Next
            </button>
          </div>
        }
      }
    }

    <section aria-labelledby="honeytokens-heading">
      <h2 id="honeytokens-heading">Honeytokens</h2>
      @switch (honeytokenState()) {
        @case ('loading') {
          <p role="status">Loading honeytokens…</p>
        }
        @case ('error') {
          <div role="alert">
            <p>Could not load honeytokens.</p>
            <button type="button" (click)="loadHoneytokens()">Try again</button>
          </div>
        }
        @case ('ready') {
          <table>
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Kind</th>
                <th scope="col">Enabled</th>
                <th scope="col">Last triggered</th>
                <th scope="col">Count</th>
                @if (auth.has('honeytokens:test')) {
                  <th scope="col">Action</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of honeytokens(); track item.id) {
                <tr>
                  <td>{{ item.label }}</td>
                  <td>{{ item.kind }}</td>
                  <td>{{ item.enabled ? 'Yes' : 'No' }}</td>
                  <td>
                    {{ item.lastTriggeredAt ? (item.lastTriggeredAt | date: 'medium') : 'Never' }}
                  </td>
                  <td>{{ item.triggerCount }}</td>
                  @if (auth.has('honeytokens:test')) {
                    <td>
                      <button
                        type="button"
                        [disabled]="testingId() !== null || !item.enabled"
                        (click)="test(item)"
                      >
                        Send test alert
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
  styles: `
    form {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 0.75rem;
      margin-block: 1rem;
    }
    label {
      display: grid;
      gap: 0.25rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 0.45rem;
      border-bottom: 1px solid #ccc;
      text-align: left;
      vertical-align: top;
    }
    pre {
      max-width: 32rem;
      margin: 0.25rem 0 0;
      white-space: pre-wrap;
    }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 0.75rem;
      border: 1px solid currentColor;
    }
    .critical {
      color: #a40000;
      font-weight: 700;
    }
    .warning {
      color: #855600;
    }
    .info {
      color: #185a8d;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    section {
      margin-top: 2rem;
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
export class SecurityEventsComponent {
  private readonly api = inject(AdminApi);
  private readonly alerts = inject(SecurityAlertService);
  protected readonly auth = inject(AuthService);
  protected readonly eventTypes = EVENT_TYPES;
  protected readonly pageSize = 20;
  protected readonly state = signal<LoadState>('loading');
  protected readonly events = signal<SecurityEvent[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly busyEventIds = signal(new Set<string>());
  protected readonly honeytokenState = signal<LoadState>('loading');
  protected readonly honeytokens = signal<HoneytokenStatus[]>([]);
  protected readonly testingId = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected typeFilter = '';
  protected severityFilter: '' | SecurityEventSeverity = '';
  protected acknowledgedFilter: '' | 'true' | 'false' = '';
  protected fromFilter = '';
  protected toFilter = '';

  constructor() {
    this.loadEvents();
    this.loadHoneytokens();
  }

  protected loadEvents(): void {
    this.state.set('loading');
    this.api.listSecurityEvents(this.query()).subscribe({
      next: (result) => {
        this.events.set(result.items);
        this.total.set(result.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected loadHoneytokens(): void {
    this.honeytokenState.set('loading');
    this.api.listHoneytokens().subscribe({
      next: ({ items }) => {
        this.honeytokens.set(items);
        this.honeytokenState.set('ready');
      },
      error: () => this.honeytokenState.set('error'),
    });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.loadEvents();
  }

  protected changePage(delta: number): void {
    this.page.update((page) => page + delta);
    this.loadEvents();
  }

  protected acknowledge(event: SecurityEvent): void {
    this.busyEventIds.update((ids) => new Set(ids).add(event.id));
    this.api.acknowledgeSecurityEvent(event.id).subscribe({
      next: (updated) => {
        this.events.update((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.busyEventIds.update((ids) => {
          const next = new Set(ids);
          next.delete(event.id);
          return next;
        });
        this.alerts.markAcknowledged(event);
        this.notice.set('Security event acknowledged.');
      },
      error: () => {
        this.busyEventIds.update((ids) => {
          const next = new Set(ids);
          next.delete(event.id);
          return next;
        });
        this.notice.set('Could not acknowledge the security event.');
      },
    });
  }

  protected test(item: HoneytokenStatus): void {
    this.testingId.set(item.id);
    this.api.testHoneytoken(item.id).subscribe({
      next: () => {
        this.testingId.set(null);
        this.notice.set(`Test alert sent for ${item.label}.`);
        this.loadEvents();
      },
      error: () => {
        this.testingId.set(null);
        this.notice.set(`Could not send the test alert for ${item.label}.`);
      },
    });
  }

  private query(): SecurityEventQuery {
    return {
      page: this.page(),
      pageSize: this.pageSize,
      ...(this.typeFilter && { type: this.typeFilter }),
      ...(this.severityFilter && { severity: this.severityFilter }),
      ...(this.acknowledgedFilter && { acknowledged: this.acknowledgedFilter === 'true' }),
      ...(this.fromFilter && { from: new Date(this.fromFilter).toISOString() }),
      ...(this.toFilter && { to: new Date(this.toFilter).toISOString() }),
    };
  }
}
