export interface FinancialStateMetrics {
  cashBalance: number;
  totalInflows: number;
  totalOutflows: number;
  totalRevenue: number;
  totalExpenses: number;
  totalReceivables: number;
  totalPayables: number;
  totalRepayments: number;
  repaymentEventCount: number;
  averageRepayment: number;
  lastRepaymentAt: string | null;
  netCashFlow: number;
  eventCount: number;
  lastEventOccurredAt: string | null;
}

export interface FinancialState {
  businessId: string;
  version: number;
  status: 'not_available' | 'available' | 'stale' | 'rebuilding';
  asOf: Date | null;
  health: FinancialStateMetrics;
  freshness: Record<string, unknown>;
  updatedAt: Date;
}

export interface FinancialHealthIndicators {
  riskBand: 'unknown' | 'stable' | 'watch' | 'critical';
  averageDailyOutflow: number;
  cashRunwayDays: number | null;
  expenseToRevenueRatio: number | null;
  receivablePressureRatio: number | null;
  repaymentLoadRatio: number | null;
  recentNetCashFlow: number;
  previousNetCashFlow: number;
  warnings: string[];
}

export interface FinancialTrendPoint {
  periodStart: string;
  inflows: number;
  outflows: number;
  revenue: number;
  expenses: number;
  receivables: number;
  payables: number;
  repayments: number;
  netCashFlow: number;
  eventCount: number;
}

export interface FinancialIntelligence {
  businessId: string;
  generatedAt: Date;
  state: FinancialState;
  indicators: FinancialHealthIndicators;
  trends: FinancialTrendPoint[];
  windowDays: number;
}
