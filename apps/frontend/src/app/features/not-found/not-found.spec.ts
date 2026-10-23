// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { NotFound } from './not-found';

describe('NotFound', () => {
  it('links back to the dashboard', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toBe('Page not found');
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/dashboard');
  });

  it('does not reveal whether the page is missing or merely off limits', () => {
    // The server answers 404 for a ticket the caller may not read, so that its existence stays
    // secret. A page that said "no such ticket" would undo that.
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'does not exist, or you are not allowed to see it',
    );
  });
});
