// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { loadAuth, meResponse } from '../../__fixtures__/session';
import type { AuthStage, MeResponse, Role } from '../../core/auth/auth.models';
import { MainNav } from './main-nav';

async function linksFor(me: MeResponse | null): Promise<string[]> {
  await loadAuth(me);
  const fixture = TestBed.createComponent(MainNav);
  fixture.detectChanges();
  const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');
  return Array.from(links, (link) => link.getAttribute('href') ?? '');
}

describe('MainNav', () => {
  it('shows the Administrator user administration and no ticket link', async () => {
    const links = await linksFor(meResponse('ADMINISTRATOR'));

    expect(links).toStrictEqual(['/dashboard', '/admin/users', '/admin/security']);
    expect(links.filter((href) => href.startsWith('/tickets'))).toStrictEqual([]);
  });

  it.each(['MANAGER', 'EMPLOYEE', 'GUEST'] as Role[])(
    'shows the %s the ticket links and no administration link',
    async (role) => {
      const links = await linksFor(meResponse(role));

      expect(links).toStrictEqual(['/dashboard', '/tickets', '/tickets/new']);
      expect(links.filter((href) => href.startsWith('/admin'))).toStrictEqual([]);
    },
  );

  it('shows no menu to nobody', async () => {
    expect(await linksFor(null)).toStrictEqual([]);
  });

  it.each(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'] as AuthStage[])(
    'shows no menu while the session is in stage %s: the only way on is the password change',
    async (stage) => {
      expect(await linksFor(meResponse('ADMINISTRATOR', stage))).toStrictEqual([]);
    },
  );
});
