// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Forbidden } from './forbidden';

describe('Forbidden', () => {
  it('says plainly that access is denied and links back to the dashboard', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Forbidden);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toBe('Access denied');
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/dashboard');
  });
});
