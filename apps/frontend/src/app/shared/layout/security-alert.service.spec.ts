// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AdminApi, type SecurityEvent } from '../../core/http/admin-api.service';
import { SecurityAlertService } from './security-alert.service';

const event = (severity: SecurityEvent['severity']): SecurityEvent => ({
  id: 'event-id',
  type: 'HONEYTOKEN_TRIGGERED',
  severity,
  occurredAt: '2030-01-01T00:00:00.000Z',
  ipKey: null,
  subjectUserId: null,
  details: {},
  requestId: 'request-id',
  acknowledgedAt: null,
  acknowledgedBy: null,
  alertStatus: 'NONE',
  alertAttemptedAt: null,
});

function setup(list = vi.fn(() => of({ items: [], page: 1, pageSize: 1, total: 3 }))) {
  TestBed.configureTestingModule({
    providers: [{ provide: AdminApi, useValue: { listSecurityEvents: list } }],
  });
  return { service: TestBed.inject(SecurityAlertService), list };
}

describe('SecurityAlertService', () => {
  it('loads only the one-row unacknowledged CRITICAL count query', () => {
    const { service, list } = setup();
    service.load();
    expect(list).toHaveBeenCalledExactlyOnceWith({
      severity: 'CRITICAL',
      acknowledged: false,
      page: 1,
      pageSize: 1,
    });
    expect(service.unacknowledgedCritical()).toBe(3);
  });

  it('fails closed to no banner and decrements only acknowledged critical events', () => {
    const { service } = setup(vi.fn(() => throwError(() => new Error('offline'))));
    service.unacknowledgedCritical.set(2);
    service.load();
    expect(service.unacknowledgedCritical()).toBe(0);
    service.unacknowledgedCritical.set(2);
    service.markAcknowledged(event('INFO'));
    expect(service.unacknowledgedCritical()).toBe(2);
    service.markAcknowledged(event('CRITICAL'));
    service.markAcknowledged(event('CRITICAL'));
    service.markAcknowledged(event('CRITICAL'));
    expect(service.unacknowledgedCritical()).toBe(0);
    service.clear();
    expect(service.unacknowledgedCritical()).toBe(0);
  });
});
