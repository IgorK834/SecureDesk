import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type { CaptchaConfig } from './captcha-api.service';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_MARKER = 'script[data-securedesk-turnstile]';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      'timeout-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<TurnstileApi> | undefined;

function loadTurnstile(document: Document): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(SCRIPT_MARKER);
    const script = existing ?? document.createElement('script');
    const loaded = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile API did not initialize.'));
    };
    const failed = () => {
      script.remove();
      reject(new Error('Turnstile script could not be loaded.'));
    };
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset['securedeskTurnstile'] = '';
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    scriptLoad = undefined;
    throw error;
  });
  return scriptLoad;
}

@Component({
  selector: 'app-turnstile-captcha',
  template: `
    <div #container class="turnstile-widget"></div>
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
export class TurnstileCaptchaComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) config!: CaptchaConfig;
  @Output() readonly tokenChange = new EventEmitter<string | null>();
  readonly status = signal('Loading verification…');
  readonly failed = signal(false);

  @ViewChild('container', { static: true })
  private readonly container!: ElementRef<HTMLDivElement>;

  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private widgetId: string | undefined;
  private destroyed = false;

  ngAfterViewInit(): void {
    void this.render();
  }

  reset(): void {
    this.tokenChange.emit(null);
    if (this.widgetId && window.turnstile) {
      window.turnstile.reset(this.widgetId);
      this.status.set('Complete the verification.');
    }
  }

  retry(): void {
    this.removeWidget();
    this.failed.set(false);
    this.status.set('Loading verification…');
    void this.render();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.removeWidget();
  }

  private async render(): Promise<void> {
    try {
      const api = await loadTurnstile(this.document);
      if (this.destroyed) return;
      const config = this.config;
      if (!config.siteKey) throw new Error('Turnstile site key is missing.');
      this.widgetId = api.render(this.container.nativeElement, {
        sitekey: config.siteKey,
        action: config.action,
        callback: (token) =>
          this.zone.run(() => {
            this.failed.set(false);
            this.status.set('Verification complete.');
            this.tokenChange.emit(token);
          }),
        'expired-callback': () =>
          this.zone.run(() => {
            this.status.set('Verification expired. Complete it again.');
            this.tokenChange.emit(null);
          }),
        'error-callback': () => this.markFailed(),
        'timeout-callback': () =>
          this.zone.run(() => {
            this.status.set('Verification timed out. Complete it again.');
            this.tokenChange.emit(null);
          }),
      });
      this.status.set('Complete the verification.');
    } catch {
      if (!this.destroyed) this.markFailed();
    }
  }

  private markFailed(): void {
    this.zone.run(() => {
      this.failed.set(true);
      this.status.set('Verification could not load. Check your connection and retry.');
      this.tokenChange.emit(null);
    });
  }

  private removeWidget(): void {
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
    this.widgetId = undefined;
  }
}
