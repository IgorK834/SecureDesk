// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import type { AuditEntry, AuditPage, AuditVerification } from '../../core/http/admin-api.service';
import { AuditLogComponent } from './audit-log.component';

const URL = '/api/admin/audit-log';
const entry: AuditEntry = {
  seq: 12,
  id: 'id-12',
  occurredAt: '2026-11-26T09:15:00.123Z',
  actor: { type: 'USER', userId: 'user-1', login: 'employee1' },
  subject: { login: null, ref: 'ref:abcdef1234567890' },
  ip: '2001:db8::1',
  action: 'AUTH_LOGIN_FAILURE',
  description: 'Sign-in refused.',
  outcome: 'FAILURE',
  details: { reason: 'BAD_CREDENTIALS' },
  requestId: 'request-1',
  prevHash: 'a'.repeat(64),
  entryHash: 'b'.repeat(64),
};
const page: AuditPage = {
  items: [entry],
  total: 1,
  page: 1,
  pageSize: 20,
  actions: ['AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE'],
};

function setup(canManage = true, verification: AuditVerification | null = null, range = {}) {
  const queryParamMap = new BehaviorSubject(convertToParamMap(range));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap } },
      { provide: AuthService, useValue: { has: () => canManage } },
    ],
  });
  const fixture = TestBed.createComponent(AuditLogComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(URL + '/integrity').flush({ verification });
  const root = fixture.nativeElement as HTMLElement;
  const list = () => http.expectOne((request) => request.url === URL && request.method === 'GET');
  const text = () => root.textContent ?? '';
  function field(name: string, value: string) {
    const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(
      '[formControlName="' + name + '"]',
    )!;
    input.value = value;
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
  }
  const submit = () =>
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const click = (name: string) =>
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === name)!
      .click();
  return {
    http,
    root,
    list,
    text,
    field,
    submit,
    click,
    fixture,
    queryParamMap,
    render: () => fixture.detectChanges(),
  };
}

afterEach(() => {
  const http = TestBed.inject(HttpTestingController);
  for (const request of http.match('/api/admin/detection-rules')) request.flush({ items: [] });
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuditLogComponent', () => {
  const verifiedAt = '2026-11-26T09:15:00.123Z';

  it('shows detection thresholds, UTC last alert times, and loads the linked sequence range', () => {
    const t = setup(true, null, { fromSeq: '12', toSeq: '16' });
    const request = t.list();
    expect(request.request.params.get('fromSeq')).toBe('12');
    expect(request.request.params.get('toSeq')).toBe('16');
    request.flush(page);
    t.http.expectOne('/api/admin/detection-rules').flush({
      items: [
        {
          id: 'BURST',
          title: 'Burst of failed logins',
          threshold: 5,
          windowMinutes: 5,
          severity: 'WARNING',
          lastAlertAt: null,
        },
        {
          id: 'SUCCESS',
          title: 'Successful login after failed attempts',
          threshold: 3,
          windowMinutes: 10,
          severity: 'CRITICAL',
          lastAlertAt: verifiedAt,
        },
      ],
    });
    t.render();
    expect(t.text()).toContain('5 failures in 5 minutes');
    expect(t.text()).toContain('3 failures in 10 minutes');
    expect(t.text()).toContain('2026-11-26 09:15:00 UTC');
    expect(t.text()).toContain('Alert entries #12–#16');
    t.queryParamMap.next(convertToParamMap({}));
    const reset = t.list();
    expect(reset.request.params.has('fromSeq')).toBe(false);
    reset.flush(page);
  });

  it('reports that detection rules could not be loaded', () => {
    const t = setup();
    t.list().flush(page);
    t.http.expectOne('/api/admin/detection-rules').flush({}, { status: 500, statusText: 'Error' });
    t.render();
    expect(t.text()).toContain('Could not load detection rules.');
  });

  it('announces verification progress and the intact result and prevents a second request', () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    const panel = t.root.querySelector('[aria-live="polite"][role="status"]')!;
    expect(panel.textContent).toContain('No verification recorded');
    const button = Array.from(t.root.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Verify integrity',
    )!;
    button.click();
    // A second activation can arrive before Angular has rendered the disabled state.
    button.click();
    t.render();
    expect(button.disabled).toBe(true);
    expect(panel.textContent).toContain('Verification is in progress');
    const request = t.http.expectOne(URL + '/verify');
    expect(request.request.method).toBe('POST');
    request.flush({ status: 'INTACT', checkedEntries: 12, verifiedAt, warnings: [] });
    t.render();
    expect(panel.textContent).toContain('Log intact');
    expect(panel.textContent).toMatch(/12\s+entries checked/);
    expect(panel.textContent).toContain('2026-11-26 09:15:00 UTC');
    expect(panel.querySelector('time')?.getAttribute('datetime')).toBe(verifiedAt);
    expect(button.disabled).toBe(false);
  });

  it('shows the last problem and filters the table to the affected entry', () => {
    const t = setup(true, {
      status: 'TAMPERED',
      checkedEntries: 12,
      verifiedAt,
      warnings: ['ANCHOR_MISSING'],
      firstProblem: { seq: entry.seq, id: entry.id, kind: 'HASH_MISMATCH' },
    });
    t.list().flush(page);
    t.render();
    expect(t.text()).toContain('Tampering detected');
    expect(t.text()).toContain('HASH_MISMATCH');
    expect(t.text()).toContain('Entry ID id-12');
    expect(t.text()).toContain('head anchor was missing');
    t.root.querySelector<HTMLAnchorElement>('a[href="#audit-entries"]')!.click();
    t.http.expectOne(URL + '/12').flush(entry);
    t.render();
    expect(t.text()).toContain('Showing entry #12');
    expect(t.root.querySelectorAll('tbody tr')).toHaveLength(1);
    t.click('Clear entry filter');
    t.list().flush(page);
    t.render();
    expect(t.text()).not.toContain('Showing entry #12');
  });

  it('handles a server conflict and an unavailable verification', () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    t.click('Verify integrity');
    t.http.expectOne(URL + '/verify').flush(
      { error: { code: 'VERIFICATION_IN_PROGRESS' } },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );
    t.render();
    expect(t.text()).toContain('A verification is already in progress');
    t.click('Verify integrity');
    t.http.expectOne(URL + '/verify').flush({}, { status: 500, statusText: 'Unavailable' });
    t.render();
    expect(t.text()).toContain('Could not verify the audit log');
  });

  it('loads, applies user/date/action/outcome filters in UTC, replaces rows, and paginates', () => {
    const t = setup();
    expect(t.text()).toContain('Loading audit entries');
    t.list().flush(page);
    t.render();
    expect(t.text()).toContain('2026-11-26 09:15:00.123');

    t.field('user', 'employee1');
    t.field('action', 'AUTH_LOGIN_SUCCESS');
    t.field('outcome', 'SUCCESS');
    t.field('from', '2026-11-26T08:30');
    t.field('to', '2026-11-26T12:00');
    t.submit();
    const filtered = t.list();
    expect(filtered.request.params.get('user')).toBe('employee1');
    expect(filtered.request.params.get('action')).toBe('AUTH_LOGIN_SUCCESS');
    expect(filtered.request.params.get('outcome')).toBe('SUCCESS');
    expect(filtered.request.params.get('from')).toBe('2026-11-26T08:30:00.000Z');
    expect(filtered.request.params.get('to')).toBe('2026-11-26T12:00:00.000Z');

    filtered.flush({ ...page, items: [{ ...entry, action: 'AUTH_LOGIN_SUCCESS' }], total: 21 });
    t.render();
    expect(t.root.querySelector('tbody')?.textContent).toContain('AUTH_LOGIN_SUCCESS');
    expect(t.root.querySelector('tbody')?.textContent).not.toContain('AUTH_LOGIN_FAILURE');
    t.click('Next');
    const next = t.list();
    expect(next.request.params.get('page')).toBe('2');
    expect(next.request.params.get('user')).toBe('employee1');
    next.flush({ ...page, page: 2, total: 21 });
    t.render();
    expect(t.text()).toContain('Page 2');
  });

  it('shows literal markup and escaped controls and retrieves details and both hashes', () => {
    const t = setup();
    const sample = {
      ...entry,
      description: '<script>literal</script> \\u000a',
      details: { text: '<script>literal</script>' },
    };
    t.list().flush({ ...page, items: [sample] });
    t.render();
    expect(t.root.querySelector('tbody')?.textContent).toContain(sample.description);
    expect(t.root.querySelector('script')).toBeNull();
    const drawer = t.root.querySelector('dialog')!;
    Object.defineProperty(drawer, 'showModal', { value: () => drawer.setAttribute('open', '') });
    Object.defineProperty(drawer, 'close', {
      value: () => {
        drawer.removeAttribute('open');
        drawer.dispatchEvent(new Event('close'));
      },
    });
    t.click('#12');
    t.render();
    expect(drawer.textContent).toContain('Loading audit entry');
    t.http.expectOne(URL + '/12').flush(sample);
    t.render();
    expect(drawer.textContent).toContain(entry.prevHash);
    expect(drawer.textContent).toContain(entry.entryHash);
    expect(drawer.querySelector('pre')?.textContent).toContain('<script>literal</script>');
    expect(drawer.querySelector('script')).toBeNull();
    t.click('Close');
    expect(drawer.open).toBe(false);
  });

  it('POSTs both export formats with the applied filters and uses the attachment filename', async () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    t.field('user', 'employee1');
    t.submit();
    t.list().flush(page);
    t.render();
    t.field('user', 'unsaved draft');

    const create = vi.fn(() => 'blob:fixture');
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends globalThis.URL {
        static override createObjectURL = create;
        static override revokeObjectURL = revoke;
      },
    );
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });
    for (const [button, format] of [
      ['Export CSV', 'csv'],
      ['Export JSON Lines', 'jsonl'],
    ]) {
      t.click(button!);
      const requested = t.http.expectOne(URL + '/export');
      expect(requested.request.method).toBe('POST');
      expect(requested.request.responseType).toBe('blob');
      expect(requested.request.body).toEqual({ user: 'employee1', format });
      const blob = new Blob(['fixture']);
      requested.flush(blob, {
        headers: { 'Content-Disposition': 'attachment; filename="server.' + format + '"' },
      });
      expect(create).toHaveBeenLastCalledWith(blob);
    }
    expect(filenames).toEqual(['server.csv', 'server.jsonl']);
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(2));
  });

  it('handles an invalid date range, a failed load and an empty result', () => {
    const t = setup(false);
    t.list().flush(null, { status: 500, statusText: 'Error' });
    t.render();
    expect(t.text()).toContain('Could not load audit entries');
    expect(t.text()).not.toContain('Export CSV');
    t.click('Try again');
    t.list().flush({ ...page, items: [], total: 0 });
    t.render();
    expect(t.text()).toContain('No audit entries');
    t.field('from', '2026-11-26T10:00');
    t.field('to', '2026-11-26T09:00');
    t.submit();
    t.render();
    expect(t.text()).toContain('start time must be before');
  });

  it('rejects long user searches and invalid UTC input locally', () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    t.field('user', 'x'.repeat(129));
    t.submit();
    t.render();
    expect(t.text()).toContain('Enter at most 128 characters');

    t.field('user', '');
    t.fixture.componentInstance['form'].controls.from.setValue('invalid');
    t.submit();
    t.render();
    expect(t.text()).toContain('Enter valid UTC dates');
  });

  it('handles detail failure and retains the audit table', () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    const drawer = t.root.querySelector('dialog')!;
    Object.defineProperty(drawer, 'showModal', { value: () => drawer.setAttribute('open', '') });
    t.click('#12');
    t.http.expectOne(URL + '/12').flush(null, { status: 404, statusText: 'Not Found' });
    t.render();
    expect(drawer.textContent).toContain('Could not load this audit entry');
    expect(t.root.querySelector('tbody')?.textContent).toContain('AUTH_LOGIN_FAILURE');
  });

  it('shows an English export error when the file is absent or the row cap is exceeded', async () => {
    const t = setup();
    t.list().flush(page);
    t.render();
    t.click('Export CSV');
    t.http.expectOne(URL + '/export').flush(null);
    t.render();
    expect(t.text()).toContain('Could not download the audit log');

    t.click('Export JSON Lines');
    const errorBody = new Blob([], { type: 'application/json' });
    Object.defineProperty(errorBody, 'text', {
      value: async () => JSON.stringify({ error: { code: 'EXPORT_TOO_LARGE' } }),
    });
    t.http.expectOne(URL + '/export').flush(errorBody, { status: 400, statusText: 'Bad Request' });
    await t.fixture.whenStable();
    t.render();
    expect(t.text()).toContain('Too many entries to export. Narrow the filters.');
  });
});
