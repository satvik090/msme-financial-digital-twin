import { Router } from 'express';
import { z } from 'zod';
import { businessRepository } from '../repositories/business.repository.js';
import { HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { financialEventService } from '../services/financial-event.service.js';
import { financialIntelligenceService } from '../services/financial-intelligence.service.js';
import { mlIntelligenceService } from '../services/ml-intelligence.service.js';
import {
  FinancialEventInput,
  financialEventTypes,
} from '../domain/financial-event.js';
import { authenticate, requireRole } from '../middleware/security.js';

const createSchema = z.object({
  body: z.object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().max(200).optional(),
    externalId: z.string().trim().max(100).optional(),
    currency: z.string().length(3).optional(),
    timezone: z.string().max(100).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const listSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

const idSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}),
});

const eventSchema = z.object({
  body: z.object({
    type: z.enum(financialEventTypes),
    source: z.string().trim().min(1).max(100),
    sourceEventId: z.string().trim().min(1).max(200),
    occurredAt: z.string().datetime({ offset: true }),
    amount: z.number().finite().positive().max(1_000_000_000_000),
    direction: z.enum(['inflow', 'outflow']),
    currency: z.string().length(3).transform((value) => value.toUpperCase()),
    description: z.string().trim().max(500).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}),
});

const intelligenceSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    days: z.coerce.number().int().min(7).max(365).default(90),
    bucket: z.enum(['day', 'week', 'month']).default('day'),
  }),
});

const mlIntelligenceSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    days: z.coerce.number().int().min(30).max(730).default(180),
    horizonDays: z.coerce.number().int().min(7).max(90).default(30),
  }),
});

const eventHistorySchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

const stateHistorySchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export const businessRouter = Router();

/**
 * Public read-only dashboard endpoints.
 * Authentication is intentionally not applied globally because
 * the deployed portfolio dashboard has no login UI.
 */

businessRouter.get(
  '/',
  validate(listSchema),
  async (req, res, next) => {
    try {
      const { limit, offset } = res.locals.validated.query as {
        limit: number;
        offset: number;
      };

      res.json({
        data: await businessRepository.list(limit, offset),
        limit,
        offset,
      });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * Business creation remains protected.
 */
businessRouter.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate(createSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        data: await businessRepository.create(req.body),
      });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * Event ingestion remains protected.
 */
businessRouter.post(
  '/:id/events',
  authenticate,
  requireRole('analyst', 'admin'),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const input = req.body as Omit<
        FinancialEventInput,
        'occurredAt'
      > & {
        occurredAt: string;
      };

      const result = await financialEventService.ingest(id, {
        ...input,
        occurredAt: new Date(input.occurredAt),
      });

      return res
        .status(result.duplicate ? 200 : 202)
        .json({
          data: {
            eventId: result.event.id,
            businessId: result.event.businessId,
            status: result.event.status,
            duplicate: result.duplicate,
          },
        });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id/twin',
  validate(idSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      return res.json({
        data: await financialIntelligenceService.getCurrentState(id),
      });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id/intelligence',
  validate(intelligenceSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const { days, bucket } = res.locals.validated.query as {
        days: number;
        bucket: 'day' | 'week' | 'month';
      };

      return res.json({
        data: await financialIntelligenceService.getDashboard(id, {
          days,
          bucket,
        }),
      });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id/ml-intelligence',
  validate(mlIntelligenceSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const { days, horizonDays } = res.locals.validated.query as {
        days: number;
        horizonDays: number;
      };

      return res.json({
        data: await mlIntelligenceService.predict(id, {
          days,
          horizonDays,
        }),
      });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id/events',
  validate(eventHistorySchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const query = res.locals.validated.query as {
        from?: string;
        to?: string;
        limit: number;
        offset: number;
      };

      const events = await financialIntelligenceService.listEvents(id, {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      return res.json({
        data: events,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id/twin/history',
  validate(stateHistorySchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const { limit } = res.locals.validated.query as {
        limit: number;
      };

      return res.json({
        data: await financialIntelligenceService.listStateHistory(
          id,
          limit,
        ),
        limit,
      });
    } catch (e) {
      return next(e);
    }
  },
);

businessRouter.get(
  '/:id',
  validate(idSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const business = await businessRepository.findById(id);

      if (!business) {
        throw new HttpError(404, 'Business not found');
      }

      res.json({
        data: business,
      });
    } catch (e) {
      next(e);
    }
  },
);
