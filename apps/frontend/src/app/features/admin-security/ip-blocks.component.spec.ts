// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { type Observable, of, throwError } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { apiFailure } from '../../__fixtures__/admin-users';
import { installDialogPolyfill } from '../../__fixtures__/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type IpBlock } from '../../core/http/admin-api.service';
import { IpBlocksComponent } from './ip-blocks.component';

beforeAll(installDialogPolyfill);

const BLOCK: IpBlock = {
  ipKey: '203.0.113.7',
  failedAttempts: 20,
  lockedUntil: '2030-01-01T00:15:00.000Z',
};

function setUp(
  options: {
    items?: IpBlock[];
    granted?: string[];
    list?: () => Observable<{ items: IpBlock[] }>;
    clear?: (ipKey: string) => Observable<void>;
  } = {},
) {
  const granted = options.granted ?? ['ip-blocks:read', 'ip-blocks:clear'];
  const api = {
    listIpBlocks: vi.fn(options.list ?? (() => of({ items: options.items ?? [BLOCK] }))),
    clearIpBlock: vi.fn(options.clear ?? (() => of(undefined as void))),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminApi, useValue: api },
      {
        provide: AuthService,
        useValue: { has: (permission: string) => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(IpBlocksComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    api,
    root,
    text: () => root.textContent ?? '',
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    },
  };
}

describe('IpBlocksComponent', () => {
  it('shows the live address, failure count and deadline returned by the API', () => {
    const t = setUp();

    expect(t.api.listIpBlocks).toHaveBeenCalledOnce();
    expect(t.text()).toContain('203.0.113.7');
    expect(t.text()).toContain('20');
    expect(t.root.querySelector('table')).not.toBeNull();
  });

  it('shows an empty state', () => {
    const empty = setUp({ items: [] });

    expect(empty.text()).toContain('No addresses are blocked');
  });

  it('hides clear controls without clear permission', () => {
    const readOnly = setUp({ granted: ['ip-blocks:read'] });

    expect(readOnly.root.querySelectorAll('button')).toHaveLength(0);
  });

  it('confirms a clear, calls the encoded-key API abstraction and removes the row', async () => {
    const t = setUp();
    (t.root.querySelector('button') as HTMLButtonElement).click();
    await t.settle();
    const dialog = t.root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('counter will start from zero');
    expect(t.api.clearIpBlock).not.toHaveBeenCalled();

    (
      [...dialog.querySelectorAll('button')].find((button) => button.className === 'confirm') as
        HTMLButtonElement | undefined
    )?.click();
    await t.settle();

    expect(t.api.clearIpBlock).toHaveBeenCalledExactlyOnceWith('203.0.113.7');
    expect(t.text()).toContain('Address block 203.0.113.7 cleared');
    expect(t.text()).toContain('No addresses are blocked');
  });

  it('offers retry after a load failure', () => {
    const loadFailure = setUp({ list: () => throwError(() => apiFailure(500)) });
    expect(loadFailure.text()).toContain('Could not load address blocks');
    expect(loadFailure.text()).toContain('Try again');
  });

  it('keeps a failed clear visible', async () => {
    const clearFailure = setUp({ clear: () => throwError(() => apiFailure(500)) });
    (clearFailure.root.querySelector('button') as HTMLButtonElement).click();
    await clearFailure.settle();
    const dialog = clearFailure.root.querySelector('dialog') as HTMLDialogElement;
    (
      [...dialog.querySelectorAll('button')].find((button) => button.className === 'confirm') as
        HTMLButtonElement | undefined
    )?.click();
    await clearFailure.settle();
    expect(clearFailure.text()).toContain('Something went wrong. Try again.');
    expect(clearFailure.text()).toContain('203.0.113.7');
  });
});
