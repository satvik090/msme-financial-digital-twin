export const financialEventTypes = ['transaction', 'revenue', 'expense', 'receivable', 'payable', 'repayment', 'other'] as const;
export type FinancialEventType = (typeof financialEventTypes)[number];

export type EventDirection = 'inflow' | 'outflow';
export type FinancialEventStatus = 'pending' | 'processing' | 'processed' | 'dead_letter';

export interface FinancialEventInput {
  type: FinancialEventType;
  source: string;
  sourceEventId: string;
  occurredAt: Date;
  amount: number;
  direction: EventDirection;
  currency: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface FinancialEvent extends FinancialEventInput {
  id: string;
  businessId: string;
  schemaVersion: number;
  receivedAt: Date;
  status: FinancialEventStatus;
  attempts: number;
  nextAttemptAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}

export interface EventIngestionResult {
  event: FinancialEvent;
  duplicate: boolean;
}
