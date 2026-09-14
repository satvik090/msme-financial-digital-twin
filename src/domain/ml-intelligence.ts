import { FinancialEventType, EventDirection } from './financial-event.js';
import { FinancialState } from './financial-state.js';

export type PredictionStatus = 'ok' | 'insufficient_data' | 'degraded';
export type PredictionConfidence = 'low' | 'medium' | 'high';
export type PredictionRiskBand = 'unknown' | 'stable' | 'watch' | 'critical';
export type RiskTrajectoryDirection = 'unknown' | 'improving' | 'stable' | 'deteriorating';

export interface MLPredictionEvent {
  id: string;
  type: FinancialEventType;
  occurredAt: string;
  amount: number;
  direction: EventDirection;
  currency: string;
}

export interface MLPredictionRequest {
  businessId: string;
  generatedAt: string;
  horizonDays: number;
  currentState: Pick<FinancialState, 'status' | 'asOf' | 'health'> | null;
  events: MLPredictionEvent[];
}

export interface CashFlowForecastPoint {
  date: string;
  predictedNetCashFlow: number;
  projectedCashBalance: number | null;
  lowerBound: number;
  upperBound: number;
  confidence: PredictionConfidence;
}

export interface CashFlowForecast {
  status: PredictionStatus;
  method: string;
  horizonDays: number;
  points: CashFlowForecastPoint[];
  expectedNetCashFlow: number;
  expectedEndingCashBalance: number | null;
  explanation: string[];
}

export interface FinancialAnomaly {
  date: string;
  anomalyScore: number;
  severity: 'low' | 'medium' | 'high';
  observed: {
    inflows: number;
    outflows: number;
    revenue: number;
    expenses: number;
    netCashFlow: number;
    eventCount: number;
  };
  reasons: string[];
}

export interface AnomalyDetectionResult {
  status: PredictionStatus;
  method: string;
  anomalies: FinancialAnomaly[];
  explanation: string[];
}

export interface RiskTrajectorySignal {
  riskScore: number | null;
  riskBand: PredictionRiskBand;
  trajectory: RiskTrajectoryDirection;
  confidence: PredictionConfidence;
  drivers: string[];
  nextReviewRecommendation: string;
}

export interface MLGeneratedInsights {
  summary: string[];
  operationalActions: string[];
  dataQualityWarnings: string[];
}

export interface FinancialMLPrediction {
  businessId: string;
  generatedAt: string;
  modelVersion: string;
  dataWindow: {
    startDate: string | null;
    endDate: string | null;
    eventCount: number;
    activeDays: number;
  };
  forecast: CashFlowForecast;
  anomalyDetection: AnomalyDetectionResult;
  riskTrajectory: RiskTrajectorySignal;
  insights: MLGeneratedInsights;
}
