import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiClient } from './core/http/api-client.service';
import { MainNav } from './shared/layout/main-nav';

@Component({
  imports: [RouterOutlet, MainNav],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // Skeleton-only smoke check proving the SPA reaches the backend through the /api proxy.
  protected readonly apiStatus = toSignal(
    inject(ApiClient)
      .health()
      .pipe(
        map((response) => response.status),
        catchError(() => of('unreachable')),
      ),
    { initialValue: 'checking…' },
  );
}
