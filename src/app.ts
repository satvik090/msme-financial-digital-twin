import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  private readonly apiUrl =
    'https://msme-financial-digital-twin.onrender.com/api/v1';

  constructor(private readonly http: HttpClient) {}

  getBusinesses(): Observable<any> {
    return this.http.get(`${this.apiUrl}/businesses`);
  }

  getBusinessIntelligence(
    businessId: string,
    days = 90,
    bucket = 'day'
  ): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/businesses/${businessId}/intelligence`,
      {
        params: {
          days,
          bucket,
        },
      }
    );
  }

  getMlIntelligence(businessId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/businesses/${businessId}/ml-intelligence`
    );
  }

  getEvents(businessId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/businesses/${businessId}/events`
    );
  }

  getTwin(businessId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/businesses/${businessId}/twin`
    );
  }

  getTwinHistory(businessId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/businesses/${businessId}/twin/history`
    );
  }
}
