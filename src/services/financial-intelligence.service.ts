import { FinancialEvent } from '../domain/financial-event.js';
import { FinancialIntelligence, FinancialState } from '../domain/financial-state.js';
import { HttpError } from '../middleware/errors.js';
import { financialEventRepository } from '../repositories/financial-event.repository.js';
import { businessRepository } from '../repositories/business.repository.js';
import { aggregateTrends, calculateHealthIndicators } from './financial-state.calculator.js';
import { dashboardCache } from './dashboard-cache.service.js';

const MAX_INTELLIGENCE_EVENTS = 10_000;

export interface IntelligenceOptions {
  days: number;
  bucket: 'day' | 'week' | 'month';
}

export interface EventHistoryOptions {
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

function fromDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function ensureBusiness(businessId: string): Promise<void> {
  if (!await businessRepository.findById(businessId)) throw new HttpError(404, 'Business not found');
}

export const financialIntelligenceService = {
  async getCurrentState(businessId: string): Promise<FinancialState> {
    await ensureBusiness(businessId);
    const state = await financialEventRepository.findState(businessId);
    if (!state) throw new HttpError(404, 'Financial state not available');
    return state;
  },

  async getDashboard(businessId: string, options: IntelligenceOptions): Promise<FinancialIntelligence> {
    const cacheKey = `${businessId}:${options.days}:${options.bucket}`;
    const cached = dashboardCache.get<FinancialIntelligence>(cacheKey); if (cached) return cached;
    const state = await this.getCurrentState(businessId);
    const events = await financialEventRepository.listProcessed(businessId, { from: fromDaysAgo(options.days), limit: MAX_INTELLIGENCE_EVENTS, offset: 0 });
    const result = {
      businessId,
      generatedAt: new Date(),
      state,
      indicators: calculateHealthIndicators(state.health, events, options.days),
      trends: aggregateTrends(events, options.bucket),
      windowDays: options.days,
    }; dashboardCache.set(cacheKey, result); return result;
  },

  async listEvents(businessId: string, options: EventHistoryOptions): Promise<FinancialEvent[]> {
    await ensureBusiness(businessId);
    return financialEventRepository.listProcessed(businessId, options);
  },

  async listStateHistory(businessId: string, limit: number): Promise<FinancialState[]> {
    await ensureBusiness(businessId);
    return financialEventRepository.listStateHistory(businessId, limit);
  },
};
