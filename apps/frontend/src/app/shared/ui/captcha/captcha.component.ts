import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CaptchaApiService,
  type CaptchaConfig,
  type CaptchaProof,
  type CaptchaPurpose,
} from './captcha-api.service';
import { TurnstileCaptchaComponent } from './turnstile-captcha.component';
import { InternalCaptchaComponent } from './internal-captcha.component';
import { RecaptchaCaptchaComponent } from './recaptcha-captcha.component';

@Component({
  selector: 'app-captcha',
  imports: [InternalCaptchaComponent, RecaptchaCaptchaComponent, TurnstileCaptchaComponent],
  template: `
    @if (loading()) {
      <p aria-live="polite">Loading verification…</p>
    } @else if (config(); as selected) {
      @if (selected.provider === 'turnstile') {
        <app-turnstile-captcha [config]="selected" (tokenChange)="acceptToken($event)" />
      } @else if (selected.provider === 'internal') {
        <app-internal-captcha [purpose]="purpose" (tokenChange)="setToken($event)" />
      } @else if (selected.provider === 'recaptcha') {
        <app-recaptcha-captcha [config]="selected" (tokenChange)="acceptToken($event)" />
      } @else {
        <p aria-live="polite">This verification provider is not available yet.</p>
      }
    } @else {
      <p aria-live="polite">Verification settings could not be loaded.</p>
      <button type="button" (click)="load()">Retry verification</button>
    }
  `,
})
export class CaptchaComponent implements OnInit {
  @Input({ required: true }) purpose!: CaptchaPurpose;
  @Output() readonly tokenChange = new EventEmitter<CaptchaProof | null>();
  readonly token = signal<CaptchaProof | null>(null);
  readonly config = signal<CaptchaConfig | null>(null);
  readonly loading = signal(true);

  @ViewChild(TurnstileCaptchaComponent)
  private turnstileChild?: TurnstileCaptchaComponent;
  @ViewChild(InternalCaptchaComponent)
  private internalChild?: InternalCaptchaComponent;
  @ViewChild(RecaptchaCaptchaComponent)
  private recaptchaChild?: RecaptchaCaptchaComponent;

  private readonly api = inject(CaptchaApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  reset(reselectProvider = false): void {
    if (reselectProvider) {
      this.load();
      return;
    }
    this.turnstileChild?.reset();
    this.internalChild?.reset();
    this.recaptchaChild?.reset();
    this.setToken(null);
  }

  protected load(): void {
    this.loading.set(true);
    this.config.set(null);
    this.setToken(null);
    this.api
      .config(this.purpose)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.config.set(config);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected acceptToken(token: string | null): void {
    this.setToken(token ? { token } : null);
  }

  protected setToken(token: CaptchaProof | null): void {
    this.token.set(token);
    this.tokenChange.emit(token);
  }
}
