import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  FinancialMLPrediction,
  MLPredictionRequest,
} from '../domain/ml-intelligence.js';
import { HttpError } from '../middleware/errors.js';

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.ML_SERVICE_TIMEOUT_MS,
  );

  const base = env.ML_SERVICE_URL.startsWith('http')
    ? env.ML_SERVICE_URL
    : `http://${env.ML_SERVICE_URL}`;

  const url = new URL(path, base);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();

      logger.warn(
        {
          status: response.status,
          path,
          body,
        },
        'ML service request failed',
      );

      throw new HttpError(502, 'ML service request failed', {
        status: response.status,
        body,
      });
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    logger.warn(
      {
        err: error,
        path,
      },
      'ML service unavailable',
    );

    throw new HttpError(
      message.includes('abort') ? 504 : 503,
      'ML service unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const mlServiceClient = {
  health(): Promise<Record<string, unknown>> {
    return requestJson<Record<string, unknown>>('/health');
  },

  predict(
    input: MLPredictionRequest,
  ): Promise<FinancialMLPrediction> {
    return requestJson<FinancialMLPrediction>('/predict', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  },
};
