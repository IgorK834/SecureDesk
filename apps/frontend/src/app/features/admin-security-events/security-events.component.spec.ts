// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdminApi,
  type HoneytokenStatus,
  type SecurityEvent,
  type SecurityEventPage,
} from '../../core/http/admin-api.service';
import { SecurityAlertService } from '../../shared/layout/security-alert.service';
import { SecurityEventsComponent } from './security-events.component';

const EVENT: SecurityEvent = {
  id: 'event-1',
  type: 'HONEYTOKEN_TRIGGERED',
  severity: 'CRITICAL',
  occurredAt: '2030-01-01T00:00:00.000Z',
  ipKey: '198.51.100.7',
  subjectUserId: null,
  details: { trapKind: 'ACCOUNT_TRAP' },
  requestId: 'request-1',
  acknowledgedAt: null,
  acknowledgedBy: null,
  alertStatus: 'SENT',
  alertAttemptedAt: '2030-01-01T00:00:01.000Z',
};
const TOKEN: HoneytokenStatus = {
  id: 'account-trap-backup-admin',
  kind: 'ACCOUNT_TRAP',
  label: 'Backup administrator account',
  enabled: true,
  lastTriggeredAt: null,
  triggerCount: 0,
};
const PAGE: SecurityEventPage = { items: [EVENT], page: 1, pageSize: 20, total: 1 };

function setup(
  options: {
    list?: ReturnType<typeof vi.fn>;
    tokens?: ReturnType<typeof vi.fn>;
    permissions?: string[];
  } = {},
) {
  const api = {
    listSecurityEvents: options.list ?? vi.fn(() => of(PAGE)),
    acknowledgeSecurityEvent: vi.fn(() =>
      of({ ...EVENT, acknowledgedAt: '2030-01-01T00:01:00.000Z', acknowledgedBy: 'admin-id' }),
    ),
    listHoneytokens: options.tokens ?? vi.fn(() => of({ items: [TOKEN] })),
    testHoneytoken: vi.fn(() => of({ eventId: 'test-event', test: true as const })),
  };
  const permissions = options.permissions ?? [
    'security-events:read',
    'security-events:acknowledge',
    'honeytokens:read',
    'honeytokens:test',
  ];
  const alerts = { markAcknowledged: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminApi, useValue: api },
      {
        provide: AuthService,
        useValue: { has: (permission: string) => permissions.includes(permission) },
      },
      { provide: SecurityAlertService, useValue: alerts },
    ],
  });
  const fixture = TestBed.createComponent(SecurityEventsComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { api, alerts, fixture, root, text: () => root.textContent ?? '' };
}

describe('SecurityEventsComponent', () => {
  it('renders events, severity, details and the secret-free honeytoken status panel', () => {
    const t = setup();
    expect(t.text()).toContain('HONEYTOKEN_TRIGGERED');
    expect(t.text()).toContain('CRITICAL');
    expect(t.text()).toContain('ACCOUNT_TRAP');
    expect(t.text()).toContain('Backup administrator account');
    expect(t.text()).toContain('Never');
  });

  it('reflects all selected filters in the next request', async () => {
    const t = setup();
    await t.fixture.whenStable();
    const select = (name: string, value: string) => {
      const element = t.root.querySelector(`[name="${name}"]`) as HTMLSelectElement;
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const input = (name: string, value: string) => {
      const element = t.root.querySelector(`[name="${name}"]`) as HTMLInputElement;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    select('type', 'CAPTCHA_FAILED');
    select('severity', 'INFO');
    select('acknowledged', 'false');
    input('from', '2030-01-01T10:00');
    input('to', '2030-01-02T11:30');
    await t.fixture.whenStable();
    t.fixture.detectChanges();
    (t.root.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(t.api.listSecurityEvents).toHaveBeenLastCalledWith({
      type: 'CAPTCHA_FAILED',
      severity: 'INFO',
      acknowledged: false,
      from: new Date('2030-01-01T10:00').toISOString(),
      to: new Date('2030-01-02T11:30').toISOString(),
      page: 1,
      pageSize: 20,
    });
  });

  it('acknowledges once, replaces the row and removes it from the banner count', () => {
    const t = setup();
    const button = [...t.root.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Acknowledge'),
    ) as HTMLButtonElement;
    button.click();
    t.fixture.detectChanges();
    expect(t.api.acknowledgeSecurityEvent).toHaveBeenCalledExactlyOnceWith('event-1');
    expect(t.alerts.markAcknowledged).toHaveBeenCalledExactlyOnceWith(EVENT);
    expect(t.text()).toContain('Security event acknowledged');
    expect(t.text()).toContain('Acknowledged');
  });

  it('sends a marked test action and reloads events', () => {
    const t = setup();
    const button = [...t.root.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Send test alert'),
    ) as HTMLButtonElement;
    button.click();
    t.fixture.detectChanges();
    expect(t.api.testHoneytoken).toHaveBeenCalledExactlyOnceWith(TOKEN.id);
    expect(t.api.listSecurityEvents).toHaveBeenCalledTimes(2);
    expect(t.text()).toContain('Test alert sent for Backup administrator account');
  });

  it('requests the next page without losing the active page size', () => {
    const list = vi.fn(() => of({ ...PAGE, total: 21 }));
    const t = setup({ list });

    const next = [...t.root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.click();

    expect(list).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
  });

  it('renders loading, empty and independent error states with retries', () => {
    const pending = new Subject<SecurityEventPage>();
    const loading = setup({ list: vi.fn(() => pending) });
    expect(loading.text()).toContain('Loading security events');
    pending.next({ items: [], total: 0, page: 1, pageSize: 20 });
    pending.complete();
    loading.fixture.detectChanges();
    expect(loading.text()).toContain('No security events match');

    TestBed.resetTestingModule();
    const failed = setup({
      list: vi.fn(() => throwError(() => new Error('events offline'))),
      tokens: vi.fn(() => throwError(() => new Error('tokens offline'))),
    });
    expect(failed.text()).toContain('Could not load security events');
    expect(failed.text()).toContain('Could not load honeytokens');
    expect(failed.root.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
  });

  it('hides acknowledge and test actions without their permissions', () => {
    const t = setup({ permissions: ['security-events:read', 'honeytokens:read'] });
    const labels = [...t.root.querySelectorAll('button')].map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).not.toContain('Acknowledge');
    expect(labels).not.toContain('Send test alert');
  });
});
