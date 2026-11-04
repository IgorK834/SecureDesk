import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CaptchaApiService,
  type CaptchaProof,
  type CaptchaPurpose,
  type InternalCaptchaChallenge,
} from './captcha-api.service';

@Component({
  selector: 'app-internal-captcha',
  template: `
    @if (challenge(); as current) {
      <div class="internal-captcha">
        <p id="captcha-instruction">{{ current.instruction }}</p>
        <img [src]="current.image" alt="CAPTCHA challenge" aria-describedby="captcha-instruction" />
        <label for="captcha-answer">Reversed characters</label>
        <input
          id="captcha-answer"
          autocomplete="off"
          [value]="answer()"
          aria-describedby="captcha-instruction captcha-expiry"
          (input)="setAnswer($any($event.target).value)"
        />
        <p id="captcha-expiry">New challenge in {{ secondsRemaining() }} seconds.</p>
      </div>
    }
    <p aria-live="polite">{{ status() }}</p>
    <button type="button" [disabled]="loading()" (click)="loadChallenge()">New challenge</button>
  `,
  styles: `
    .internal-captcha {
      display: grid;
      gap: 0.5rem;
      margin-block: 1rem;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    input {
      font: inherit;
      padding: 0.5rem;
      text-transform: uppercase;
    }
  `,
})
export class InternalCaptchaComponent implements OnInit, OnDestroy {
  @Input({ required: true }) purpose!: CaptchaPurpose;
  @Output() readonly tokenChange = new EventEmitter<CaptchaProof | null>();

  readonly challenge = signal<InternalCaptchaChallenge | null>(null);
  readonly answer = signal('');
  readonly secondsRemaining = signal(0);
  readonly status = signal('Loading verification…');
  readonly loading = signal(false);

  private readonly api = inject(CaptchaApiService);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | undefined;
  private expiresAt = 0;
  private requestSequence = 0;

  ngOnInit(): void {
    this.loadChallenge();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  reset(): void {
    this.loadChallenge();
  }

  protected setAnswer(value: string): void {
    this.answer.set(value);
    const challenge = this.challenge();
    this.tokenChange.emit(
      challenge && value ? { challengeId: challenge.challengeId, answer: value } : null,
    );
  }

  protected loadChallenge(): void {
    const sequence = ++this.requestSequence;
    this.clearTimer();
    this.loading.set(true);
    this.challenge.set(null);
    this.answer.set('');
    this.secondsRemaining.set(0);
    this.status.set('Loading verification…');
    this.tokenChange.emit(null);
    this.api
      .challenge(this.purpose)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (challenge) => {
          if (sequence !== this.requestSequence) return;
          const expiresAt = Date.parse(challenge.expiresAt);
          if (!Number.isFinite(expiresAt)) {
            this.loading.set(false);
            this.status.set('Verification could not load. Try a new challenge.');
            return;
          }
          this.expiresAt = expiresAt;
          this.challenge.set(challenge);
          this.loading.set(false);
          this.status.set('Type the characters in reverse order.');
          this.updateCountdown();
          this.timer = setInterval(() => this.updateCountdown(), 1_000);
        },
        error: () => {
          if (sequence !== this.requestSequence) return;
          this.loading.set(false);
          this.status.set('Verification could not load. Try a new challenge.');
        },
      });
  }

  private updateCountdown(): void {
    const remaining = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1_000));
    this.secondsRemaining.set(remaining);
    if (remaining === 0) this.loadChallenge();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
