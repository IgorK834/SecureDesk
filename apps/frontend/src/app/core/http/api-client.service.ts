import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface HealthResponse {
  status: 'ok';
}

/**
 * Single entry point for backend calls. Only relative `/api/...` URLs are used so that
 * the browser always talks to its own origin (dev proxy / production reverse proxy),
 * which keeps cookies same-origin and CORS out of the picture.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>('/api/health');
  }
}
