import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  createdByUserId: string;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketPage {
  items: Ticket[];
  limit: number;
  offset: number;
  total: number;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
}

const TICKETS_URL = '/api/tickets';
const ticketUrl = (id: string) => `${TICKETS_URL}/${encodeURIComponent(id)}`;

/** Typed, same-origin client for the deliberately small ticket workflow. */
@Injectable({ providedIn: 'root' })
export class TicketsApiService {
  private readonly http = inject(HttpClient);

  list(query: { limit: number; offset: number }): Observable<TicketPage> {
    const params = new HttpParams().set('limit', query.limit).set('offset', query.offset);
    return this.http.get<TicketPage>(TICKETS_URL, { params });
  }

  get(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(ticketUrl(id));
  }

  create(body: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(TICKETS_URL, body);
  }

  updateStatus(id: string, status: TicketStatus): Observable<Ticket> {
    return this.http.patch<Ticket>(`${ticketUrl(id)}/status`, { status });
  }

  assign(id: string, assignedToUserId: string): Observable<Ticket> {
    return this.http.patch<Ticket>(`${ticketUrl(id)}/assignee`, { assignedToUserId });
  }
}
