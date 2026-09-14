import { businessRepository } from '../repositories/business.repository.js';
import { financialEventRepository } from '../repositories/financial-event.repository.js';
import { FinancialEventInput } from '../domain/financial-event.js';
import { HttpError } from '../middleware/errors.js';
import { dashboardCache } from './dashboard-cache.service.js';
import { publishDashboardUpdate } from '../realtime/dashboard.gateway.js';

export const financialEventService = {
  async ingest(businessId: string, input: FinancialEventInput) {
    const business = await businessRepository.findById(businessId);
    if (!business) throw new HttpError(404, 'Business not found');
    const result = await financialEventRepository.ingest(businessId, input);
    if (!result.duplicate) { dashboardCache.invalidateBusiness(businessId); publishDashboardUpdate(businessId, { eventId: result.event.id, status: result.event.status }); }
    return result;
  },
};
