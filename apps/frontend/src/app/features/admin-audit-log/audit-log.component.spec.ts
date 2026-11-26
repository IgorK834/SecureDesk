// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import type { AuditEntry, AuditPage } from '../../core/http/admin-api.service';
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

function setup(canExport = true) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { has: () => canExport } },
    ],
  });
  const fixture = TestBed.createComponent(AuditLogComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
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
    render: () => fixture.detectChanges(),
  };
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuditLogComponent', () => {
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
