// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDialogPolyfill, pressEscape } from '../../__fixtures__/dialog';
import { TemporaryPasswordDialogComponent } from './temporary-password-dialog.component';

const PASSWORD = 'k9#Tq2!vXm7@Lp4w';
const DETAILS = { login: 'newbie', password: PASSWORD, expiresAt: '2030-01-01T12:00:00.000Z' };

beforeAll(installDialogPolyfill);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setUp() {
  const fixture = TestBed.createComponent(TemporaryPasswordDialogComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  return {
    component: fixture.componentInstance,
    dialog,
    root,
    button: (label: string) =>
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes(label)),
    flush: () => fixture.detectChanges(),
  };
}

describe('TemporaryPasswordDialogComponent', () => {
  it('is closed and shows nothing until a password is handed to it', () => {
    const { dialog, root } = setUp();

    expect(dialog.hasAttribute('open')).toBe(false);
    expect(root.textContent).not.toContain(PASSWORD);
  });

  it('shows the account, the password, its deadline and that it is shown only once', () => {
    const { component, dialog, root, flush } = setUp();

    void component.open(DETAILS);
    flush();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(root.querySelector('output')?.textContent).toBe(PASSWORD);
    expect(root.textContent).toContain('newbie');
    expect(root.textContent).toContain('only once');
    expect(root.textContent).toMatch(/Valid until .*2030/);
  });

  it('says an account was created when it is not told otherwise, and when told so', () => {
    for (const details of [DETAILS, { ...DETAILS, reason: 'created' as const }]) {
      TestBed.resetTestingModule();
      const { component, root, flush } = setUp();

      void component.open(details);
      flush();

      expect(root.textContent).toContain('has been created');
      expect(root.textContent).not.toContain('has been reset');
    }
  });

  it('says a password was reset, and that the old one no longer works, after a reset', () => {
    const { component, root, flush } = setUp();

    void component.open({ ...DETAILS, reason: 'reset' });
    flush();

    expect(root.textContent).toContain('The password of newbie has been reset');
    expect(root.textContent).toContain('old one no longer works');
    expect(root.textContent).not.toContain('has been created');
    // Whatever the reason, it is the same one-time reveal.
    expect(root.querySelector('output')?.textContent).toBe(PASSWORD);
    expect(root.textContent).toContain('only once');
  });

  it('ignores Escape: the password cannot be dismissed by accident', () => {
    const { component, dialog, root, flush } = setUp();
    void component.open(DETAILS);
    flush();

    pressEscape(dialog);
    flush();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(root.querySelector('output')?.textContent).toBe(PASSWORD);
  });

  it('stays open, and unresolved, until the administrator says they saved it', async () => {
    const { component, button, dialog, flush } = setUp();
    let resolved = false;
    void component.open(DETAILS).then(() => (resolved = true));
    flush();
    await Promise.resolve();
    expect(resolved).toBe(false);

    button('I have saved the password')?.click();
    await Promise.resolve();

    expect(resolved).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('removes the password from the page the moment it closes', async () => {
    const { component, button, root, flush } = setUp();
    const closed = component.open(DETAILS);
    flush();
    expect(root.innerHTML).toContain(PASSWORD);

    button('I have saved the password')?.click();
    await closed;
    flush();

    expect(root.innerHTML).not.toContain(PASSWORD);
    expect(root.textContent).not.toContain('newbie');
  });

  it('copies the password to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { component, button, root, flush } = setUp();
    void component.open(DETAILS);
    flush();

    button('Copy password')?.click();
    await Promise.resolve();
    await Promise.resolve();
    flush();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(PASSWORD);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Copied');
  });

  it('says when the clipboard is not available, instead of failing silently', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { component, button, root, flush } = setUp();
    void component.open(DETAILS);
    flush();

    button('Copy password')?.click();
    await Promise.resolve();
    await Promise.resolve();
    flush();

    expect(root.querySelector('[role="status"]')?.textContent).toContain('Could not copy');
  });

  it('says the same when there is no clipboard at all (a page served over plain http)', async () => {
    vi.stubGlobal('navigator', {});
    const { component, button, root, flush } = setUp();
    void component.open(DETAILS);
    flush();

    button('Copy password')?.click();
    await Promise.resolve();
    flush();

    expect(root.querySelector('[role="status"]')?.textContent).toContain('Could not copy');
  });

  it('never writes the password to the console or to browser storage', async () => {
    const log = vi.spyOn(console, 'log');
    const info = vi.spyOn(console, 'info');
    const error = vi.spyOn(console, 'error');
    const { component, button, flush } = setUp();
    const closed = component.open(DETAILS);
    flush();
    button('I have saved the password')?.click();
    await closed;

    for (const spy of [log, info, error])
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
    expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(PASSWORD);
  });

  it('clears the "copied" message when it is opened for the next password', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { component, button, root, flush } = setUp();
    const first = component.open(DETAILS);
    flush();
    button('Copy password')?.click();
    await Promise.resolve();
    await Promise.resolve();
    button('I have saved the password')?.click();
    await first;

    void component.open({ ...DETAILS, login: 'other', password: 'second-password-1!' });
    flush();

    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('keeps the open dialog, and its single answer, if opened again meanwhile', () => {
    const { component, root, flush } = setUp();
    const first = component.open(DETAILS);
    flush();

    const second = component.open({ ...DETAILS, password: 'another-password-9!' });
    flush();

    expect(second).toBe(first);
    expect(root.querySelector('output')?.textContent).toBe(PASSWORD);
  });
});
