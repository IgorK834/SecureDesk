import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { AdminApi, type SecurityEvent } from '../../core/http/admin-api.service';

/** Navigation-driven banner state. There is deliberately no timer or polling operator here. */
@Injectable({ providedIn: 'root' })
export class SecurityAlertService {
  private readonly api = inject(AdminApi);
  readonly unacknowledgedCritical = signal(0);

  load(): void {
    this.api
      .listSecurityEvents({
        severity: 'CRITICAL',
        acknowledged: false,
        page: 1,
        pageSize: 1,
      })
      .pipe(catchError(() => of({ items: [], page: 1, pageSize: 1, total: 0 })))
      .subscribe((page) => this.unacknowledgedCritical.set(page.total));
  }

  clear(): void {
    this.unacknowledgedCritical.set(0);
  }

  markAcknowledged(event: SecurityEvent): void {
    if (event.severity === 'CRITICAL') {
      this.unacknowledgedCritical.update((count) => Math.max(0, count - 1));
    }
  }
}
