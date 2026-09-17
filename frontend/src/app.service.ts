import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Business {
  id: string;
  legalName: string;
  displayName?: string;
  currency: string;
}

export interface FinancialEventInput {
  type: string;
  source: string;
  sourceEventId: string;
  occurredAt: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  currency: string;
  description?: string;
}

export interface CreateBusinessInput {
  legalName: string;
  displayName?: string;
  externalId?: string;
  currency: string;
  timezone: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private readonly base =
    'https://msme-financial-digital-twin.onrender.com/api/v1';

  private readonly demoAnalystHeaders = new HttpHeaders({
    Authorization: 'Bearer analyst:portfolio-demo',
  });

  private readonly demoAdminHeaders = new HttpHeaders({
    Authorization: 'Bearer admin:portfolio-demo',
  });

  businesses(): Observable<any> {
    return this.http.get(`${this.base}/businesses`);
  }

  createBusiness(input: CreateBusinessInput): Observable<any> {
    return this.http.post(
      `${this.base}/businesses`,
      input,
      {
        headers: this.demoAdminHeaders,
      },
    );
  }

  dashboard(id: string, days = 90): Observable<any> {
    return this.http.get(
      `${this.base}/businesses/${id}/intelligence?days=${days}&bucket=day`,
    );
  }

  ml(id: string): Observable<any> {
    return this.http.get(
      `${this.base}/businesses/${id}/ml-intelligence?days=180&horizonDays=30`,
    );
  }

  events(id: string): Observable<any> {
    return this.http.get(
      `${this.base}/businesses/${id}/events?limit=20&offset=0`,
    );
  }

  ingestEvent(
    id: string,
    input: FinancialEventInput,
  ): Observable<any> {
    return this.http.post(
      `${this.base}/businesses/${id}/events`,
      input,
      {
        headers: this.demoAnalystHeaders,
      },
    );
  }
}
