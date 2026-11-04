import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  inject,
  signal,
} from '@angular/core';
import type { CaptchaConfig } from './captcha-api.service';

const TOKEN_LIFETIME_MS = 120_000;
const SCRIPT_MARKER = 'script[data-securedesk-recaptcha]';

interface RecaptchaApi {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

let scriptLoad: Promise<RecaptchaApi> | undefined;

function loadRecaptcha(document: Document, siteKey: string): Promise<RecaptchaApi> {
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise<RecaptchaApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(SCRIPT_MARKER);
    const script = existing ?? document.createElement('script');
    const loaded = () => {
      if (window.grecaptcha) resolve(window.grecaptcha);
      else reject(new Error('reCAPTCHA API did not initialize.'));
    };
    const failed = () => {
      script.remove();
      reject(new Error('reCAPTCHA script could not be loaded.'));
    };
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}&trustedtypes=true`;
      script.async = true;
      script.defer = true;
      script.dataset['securedeskRecaptcha'] = '';
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    scriptLoad = undefined;
    throw error;
  });
  return scriptLoad;
}

@Component({
  selector: 'app-recaptcha-captcha',
  template: `
    <p aria-live="polite" class="captcha-status">{{ status() }}</p>
    @if (failed()) {
      <button type="button" (click)="retry()">Retry verification</button>
    }
  `,
  styles: `
    .captcha-status {
      margin: 0.5rem 0;
    }
  `,
})
export class RecaptchaCaptchaComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) config!: CaptchaConfig;
  @Output() readonly tokenChange = new EventEmitter<string | null>();
  readonly status = signal('Loading verification…');
  readonly failed = signal(false);

  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;
  private sequence = 0;

  ngAfterViewInit(): void {
    void this.execute();
  }

  reset(): void {
    this.tokenChange.emit(null);
    void this.execute();
  }

  retry(): void {
    this.failed.set(false);
    this.status.set('Loading verification…');
    void this.execute();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sequence += 1;
    this.clearExpiry();
  }

  private async execute(): Promise<void> {
    const sequence = ++this.sequence;
    this.clearExpiry();
    const siteKey = this.config.siteKey;
    if (!siteKey) {
      this.markFailed();
      return;
    }
    try {
      const api = await loadRecaptcha(this.document, siteKey);
      if (this.destroyed || sequence !== this.sequence) return;
      const token = await new Promise<string>((resolve, reject) => {
        api.ready(() => {
          api.execute(siteKey, { action: this.config.action }).then(resolve, reject);
        });
      });
      if (this.destroyed || sequence !== this.sequence) return;
      this.zone.run(() => {
        this.failed.set(false);
        this.status.set('Verification complete.');
        this.tokenChange.emit(token);
        this.expiryTimer = setTimeout(() => {
          this.status.set('Verification expired. Refreshing…');
          this.tokenChange.emit(null);
          void this.execute();
        }, TOKEN_LIFETIME_MS);
      });
    } catch {
      if (!this.destroyed && sequence === this.sequence) this.markFailed();
    }
  }

  private markFailed(): void {
    this.zone.run(() => {
      this.failed.set(true);
      this.status.set('Verification could not load. Check your connection and retry.');
      this.tokenChange.emit(null);
    });
  }

  private clearExpiry(): void {
    if (this.expiryTimer !== undefined) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }
}
