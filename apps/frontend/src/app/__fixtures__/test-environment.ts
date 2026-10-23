// Import this first in every spec that uses TestBed. The same specs run under two runners:
//  - `ng test` (apps/frontend): the Angular builder compiles templates and initializes TestBed;
//  - plain Vitest (root `npm test`, which gates coverage): neither happens, so it is done here.
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach } from 'vitest';

// `TestBed.platform` is null until the environment is initialized; initializing twice throws.
if (!TestBed.platform) {
  // The same strictness as the Angular builder: a typo in a template is an error.
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  });
}

// Without Vitest globals, Angular cannot register its own reset between tests.
afterEach(() => {
  TestBed.resetTestingModule();
});
