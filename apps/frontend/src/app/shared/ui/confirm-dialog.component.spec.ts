// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { installDialogPolyfill, pressEscape } from '../../__fixtures__/dialog';
import { ConfirmDialogComponent } from './confirm-dialog.component';

const OPTIONS = {
  title: 'Delete this account?',
  message: 'employee1 will be signed out at once and can never sign in again.',
  confirmLabel: 'Delete account',
};

beforeAll(installDialogPolyfill);

function setUp() {
  const fixture = TestBed.createComponent(ConfirmDialogComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  return {
    component: fixture.componentInstance,
    dialog,
    text: () => dialog.textContent ?? '',
    buttons: () => [...dialog.querySelectorAll('button')],
    flush: () => fixture.detectChanges(),
  };
}

describe('ConfirmDialogComponent', () => {
  it('is closed and empty until asked', () => {
    const { dialog, text } = setUp();

    expect(dialog.hasAttribute('open')).toBe(false);
    expect(text().trim()).toBe('');
  });

  it('opens modally and states the consequence, with the action named on the confirm button', () => {
    const { component, dialog, text, buttons, flush } = setUp();

    void component.open(OPTIONS);
    flush();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('h2')?.textContent).toBe(OPTIONS.title);
    expect(text()).toContain(OPTIONS.message);
    expect(buttons().map((b) => b.textContent?.trim())).toStrictEqual(['Cancel', 'Delete account']);
  });

  it('is labelled by its title and described by its message, for assistive technology', () => {
    const { component, dialog, flush } = setUp();

    void component.open(OPTIONS);
    flush();

    const labelledBy = dialog.getAttribute('aria-labelledby') as string;
    const describedBy = dialog.getAttribute('aria-describedby') as string;
    expect(dialog.querySelector(`#${labelledBy}`)?.textContent).toBe(OPTIONS.title);
    expect(dialog.querySelector(`#${describedBy}`)?.textContent).toBe(OPTIONS.message);
  });

  it('puts Cancel first and focused by default, so Enter cannot confirm by accident', () => {
    const { component, buttons, flush } = setUp();

    void component.open(OPTIONS);
    flush();

    const [cancel, confirm] = buttons();
    expect(cancel?.textContent?.trim()).toBe('Cancel');
    expect(cancel?.hasAttribute('autofocus')).toBe(true);
    expect(confirm?.hasAttribute('autofocus')).toBe(false);
  });

  it('answers true only when the confirm button is pressed', async () => {
    const { component, dialog, buttons, flush } = setUp();
    const answer = component.open(OPTIONS);
    flush();

    buttons()[1]?.click();

    await expect(answer).resolves.toBe(true);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('answers false when Cancel is pressed', async () => {
    const { component, dialog, buttons, flush } = setUp();
    const answer = component.open(OPTIONS);
    flush();

    buttons()[0]?.click();

    await expect(answer).resolves.toBe(false);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('answers false on Escape', async () => {
    const { component, dialog, flush } = setUp();
    const answer = component.open(OPTIONS);
    flush();

    pressEscape(dialog);

    await expect(answer).resolves.toBe(false);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('empties itself when closed, so the next question starts from a clean slate', async () => {
    const { component, buttons, text, flush } = setUp();
    const answer = component.open(OPTIONS);
    flush();
    buttons()[0]?.click();
    await answer;
    flush();

    expect(text().trim()).toBe('');
  });

  it('can be asked again, and a confirmed answer does not stick to the next question', async () => {
    const { component, buttons, flush } = setUp();
    const first = component.open(OPTIONS);
    flush();
    buttons()[1]?.click();
    await expect(first).resolves.toBe(true);
    flush();

    const second = component.open({ ...OPTIONS, title: 'Block this account?' });
    flush();
    buttons()[0]?.click();

    await expect(second).resolves.toBe(false);
  });

  it('does not read an earlier "confirm" as the answer to a question dismissed with Escape', async () => {
    const { component, dialog, buttons, flush } = setUp();
    const first = component.open(OPTIONS);
    flush();
    buttons()[1]?.click();
    await expect(first).resolves.toBe(true);
    flush();

    // Escape closes the dialog without naming an answer, and a browser then keeps the previous
    // returnValue. Without clearing it, the next question (say, "Delete?") would count as confirmed.
    const second = component.open({ ...OPTIONS, title: 'Delete this account?' });
    flush();
    pressEscape(dialog);

    await expect(second).resolves.toBe(false);
  });

  it('keeps the open question, and its single answer, if asked again while it is open', async () => {
    const { component, buttons, flush } = setUp();
    const first = component.open(OPTIONS);
    flush();

    const second = component.open({ ...OPTIONS, title: 'Something else?' });
    flush();

    expect(second).toBe(first);
    buttons()[1]?.click();
    await expect(first).resolves.toBe(true);
  });
});
