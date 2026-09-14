import { FinancialEvent } from '../domain/financial-event.js';
import { FinancialMLPrediction, MLPredictionEvent } from '../domain/ml-intelligence.js';
import { HttpError } from '../middleware/errors.js';
import { businessRepository } from '../repositories/business.repository.js';
import { financialEventRepository } from '../repositories/financial-event.repository.js';
import { mlServiceClient } from '../clients/ml-service.client.js';

const MAX_ML_EVENTS = 20_000;

export interface MLIntelligenceOptions {
  days: number;
  horizonDays: number;
}

function fromDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toPredictionEvent(event: FinancialEvent): MLPredictionEvent {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    amount: event.amount,
    direction: event.direction,
    currency: event.currency,
  };
}

export const mlIntelligenceService = {
  async predict(businessId: string, options: MLIntelligenceOptions): Promise<FinancialMLPrediction> {
    if (!await businessRepository.findById(businessId)) throw new HttpError(404, 'Business not found');
    const [state, events] = await Promise.all([
      financialEventRepository.findState(businessId),
      financialEventRepository.listProcessed(businessId, { from: fromDaysAgo(options.days), limit: MAX_ML_EVENTS, offset: 0 }),
    ]);
    return mlServiceClient.predict({
      businessId,
      generatedAt: new Date().toISOString(),
      horizonDays: options.horizonDays,
      currentState: state ? { status: state.status, asOf: state.asOf, health: state.health } : null,
      events: events.map(toPredictionEvent),
    });
  },
};
