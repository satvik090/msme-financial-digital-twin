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
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    
    while (running) {
      try {
        const events = await financialEventRepository.claimPending(env.EVENT_WORKER_BATCH_SIZE, env.EVENT_LOCK_TIMEOUT_MS);
        
        if (events.length === 0) {
          await wait(env.EVENT_WORKER_POLL_MS);
          continue;
        }

        logger.info({ batchCount: events.length }, 'Processing financial event batch');

        await Promise.all(events.map(async (event) => {
          try {
            await financialEventRepository.process(event);
            logger.info({ eventId: event.id, businessId: event.businessId, eventType: event.type, attempts: event.attempts }, 'Financial event processed successfully');
          } catch (error) {
            const outcome = await financialEventRepository.markFailed(event.id, error instanceof Error ? error : new Error(String(error)), env.EVENT_MAX_ATTEMPTS, env.EVENT_RETRY_BASE_MS);
            logger.warn({ err: error, eventId: event.id, businessId: event.businessId, attempts: event.attempts, outcome }, 'Financial event processing failed');
            
            // Track permanent failures for alerting
            if (outcome === 'dead_letter') {
              logger.error({ eventId: event.id, businessId: event.businessId }, 'Financial event moved to dead letter after max attempts');
            }
          }
        }));
        
        consecutiveErrors = 0; // Reset on successful batch
        
      } catch (error) {
        consecutiveErrors++;
        logger.error({ err: error, consecutiveErrors, pollMs: env.EVENT_WORKER_POLL_MS }, 'Financial event worker loop failed');
        
        // Exponential backoff on consecutive errors to avoid thundering herd
        const backoffMs = Math.min(env.EVENT_WORKER_POLL_MS * Math.pow(2, Math.min(consecutiveErrors, 5)), 60000);
        await wait(backoffMs);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.fatal({ consecutiveErrors }, 'Financial event worker stopping due to consecutive errors');
          running = false;
        }
      }
    }
  };

  activeLoop = run();
  logger.info({ pollMs: env.EVENT_WORKER_POLL_MS, batchSize: env.EVENT_WORKER_BATCH_SIZE, maxAttempts: env.EVENT_MAX_ATTEMPTS }, 'Financial event worker started');

  return {
    async stop() {
      logger.info('Financial event worker shutdown initiated');
      running = false;
      await activeLoop;
      logger.info('Financial event worker stopped gracefully');
    },
  };
}
