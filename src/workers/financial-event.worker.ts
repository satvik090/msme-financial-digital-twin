import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { financialEventRepository } from '../repositories/financial-event.repository.js';

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export interface EventWorker {
  stop: () => Promise<void>;
}

export function startFinancialEventWorker(): EventWorker {
  let running = true;
  let activeLoop: Promise<void> | undefined;

  const run = async (): Promise<void> => {
    while (running) {
      try {
        const events = await financialEventRepository.claimPending(env.EVENT_WORKER_BATCH_SIZE, env.EVENT_LOCK_TIMEOUT_MS);
        if (events.length === 0) {
          await wait(env.EVENT_WORKER_POLL_MS);
          continue;
        }

        await Promise.all(events.map(async (event) => {
          try {
            await financialEventRepository.process(event);
            logger.info({ eventId: event.id, businessId: event.businessId, eventType: event.type, attempts: event.attempts }, 'Financial event processed');
          } catch (error) {
            const outcome = await financialEventRepository.markFailed(event.id, error, env.EVENT_MAX_ATTEMPTS, env.EVENT_RETRY_BASE_MS);
            logger.warn({ err: error, eventId: event.id, businessId: event.businessId, attempts: event.attempts, outcome }, 'Financial event processing failed');
          }
        }));
      } catch (error) {
        logger.error({ err: error }, 'Financial event worker loop failed');
        await wait(env.EVENT_WORKER_POLL_MS);
      }
    }
  };

  activeLoop = run();
  logger.info({ pollMs: env.EVENT_WORKER_POLL_MS, batchSize: env.EVENT_WORKER_BATCH_SIZE }, 'Financial event worker started');

  return {
    async stop() {
      running = false;
      await activeLoop;
      logger.info('Financial event worker stopped');
    },
  };
}
