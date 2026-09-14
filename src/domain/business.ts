export interface Business {
  id: string;
  externalId?: string;
  legalName: string;
  displayName?: string;
  currency: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessInput {
  externalId?: string;
  legalName: string;
  displayName?: string;
  currency?: string;
  timezone?: string;
}
