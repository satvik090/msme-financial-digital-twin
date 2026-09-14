import { FinancialEvent } from '../domain/financial-event.js';
import { FinancialHealthIndicators, FinancialStateMetrics, FinancialTrendPoint } from '../domain/financial-state.js';

export function emptyFinancialMetrics(): FinancialStateMetrics {
  return {
    cashBalance: 0,
    totalInflows: 0,
    totalOutflows: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    totalReceivables: 0,
    totalPayables: 0,
    totalRepayments: 0,
    repaymentEventCount: 0,
    averageRepayment: 0,
    lastRepaymentAt: null,
    netCashFlow: 0,
    eventCount: 0,
    lastEventOccurredAt: null,
  };
}

export function applyFinancialEvent(metrics: FinancialStateMetrics, event: FinancialEvent): FinancialStateMetrics {
  const inflow = event.direction === 'inflow' ? event.amount : 0;
  const outflow = event.direction === 'outflow' ? event.amount : 0;
  const next: FinancialStateMetrics = {
    ...metrics,
    cashBalance: metrics.cashBalance + inflow - outflow,
    totalInflows: metrics.totalInflows + inflow,
    totalOutflows: metrics.totalOutflows + outflow,
    netCashFlow: metrics.netCashFlow + inflow - outflow,
    eventCount: metrics.eventCount + 1,
  };
  if (event.type === 'revenue') next.totalRevenue += event.amount;
  if (event.type === 'expense') next.totalExpenses += event.amount;
  if (event.type === 'receivable') next.totalReceivables += event.amount;
  if (event.type === 'payable') next.totalPayables += event.amount;
  if (event.type === 'repayment') {
    next.totalRepayments += event.amount;
    next.repaymentEventCount += 1;
    next.averageRepayment = next.totalRepayments / next.repaymentEventCount;
    if (!next.lastRepaymentAt || event.occurredAt > new Date(next.lastRepaymentAt)) next.lastRepaymentAt = event.occurredAt.toISOString();
  }
  if (!next.lastEventOccurredAt || event.occurredAt > new Date(next.lastEventOccurredAt)) next.lastEventOccurredAt = event.occurredAt.toISOString();
  return next;
}

export function aggregateMetrics(events: FinancialEvent[]): FinancialStateMetrics {
  return events.reduce(applyFinancialEvent, emptyFinancialMetrics());
}

function periodStart(date: Date, bucket: 'day' | 'week' | 'month'): string {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  if (bucket === 'week') {
    const day = value.getUTCDay();
    value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  }
  if (bucket === 'month') value.setUTCDate(1);
  return value.toISOString();
}

export function aggregateTrends(events: FinancialEvent[], bucket: 'day' | 'week' | 'month'): FinancialTrendPoint[] {
  const points = new Map<string, FinancialTrendPoint>();
  for (const event of events) {
    const key = periodStart(event.occurredAt, bucket);
    const point = points.get(key) ?? { periodStart: key, inflows: 0, outflows: 0, revenue: 0, expenses: 0, receivables: 0, payables: 0, repayments: 0, netCashFlow: 0, eventCount: 0 };
    if (event.direction === 'inflow') point.inflows += event.amount;
    if (event.direction === 'outflow') point.outflows += event.amount;
    if (event.type === 'revenue') point.revenue += event.amount;
    if (event.type === 'expense') point.expenses += event.amount;
    if (event.type === 'receivable') point.receivables += event.amount;
    if (event.type === 'payable') point.payables += event.amount;
    if (event.type === 'repayment') point.repayments += event.amount;
    point.netCashFlow += event.direction === 'inflow' ? event.amount : -event.amount;
    point.eventCount += 1;
    points.set(key, point);
  }
  return [...points.values()].sort((left, right) => left.periodStart.localeCompare(right.periodStart));
}

export function calculateHealthIndicators(current: FinancialStateMetrics, recentEvents: FinancialEvent[], windowDays: number): FinancialHealthIndicators {
  const midpoint = new Date(Date.now() - (windowDays / 2) * 24 * 60 * 60 * 1000);
  const recent = recentEvents.filter((event) => event.occurredAt >= midpoint);
  const previous = recentEvents.filter((event) => event.occurredAt < midpoint);
  const recentMetrics = aggregateMetrics(recent);
  const previousMetrics = aggregateMetrics(previous);
  const averageDailyOutflow = recentMetrics.totalOutflows / Math.max(windowDays / 2, 1);
  const cashRunwayDays = averageDailyOutflow > 0 ? current.cashBalance / averageDailyOutflow : null;
  const expenseToRevenueRatio = current.totalRevenue > 0 ? current.totalExpenses / current.totalRevenue : null;
  const receivablePressureRatio = current.totalRevenue > 0 ? current.totalReceivables / current.totalRevenue : null;
  const repaymentLoadRatio = current.totalInflows > 0 ? current.totalRepayments / current.totalInflows : null;
  const warnings: string[] = [];
  if (current.cashBalance < 0) warnings.push('Cash balance is negative');
  if (cashRunwayDays !== null && cashRunwayDays < 30) warnings.push('Cash runway is below 30 days');
  if (expenseToRevenueRatio !== null && expenseToRevenueRatio > 1) warnings.push('Expenses exceed recorded revenue');
  if (receivablePressureRatio !== null && receivablePressureRatio > 1) warnings.push('Recorded receivables exceed recorded revenue');
  if (recentMetrics.netCashFlow < previousMetrics.netCashFlow) warnings.push('Recent net cash flow is weaker than the prior period');
  const riskBand = current.eventCount === 0 ? 'unknown' : current.cashBalance < 0 || (cashRunwayDays !== null && cashRunwayDays < 7) ? 'critical' : warnings.length > 0 ? 'watch' : 'stable';
  return { riskBand, averageDailyOutflow, cashRunwayDays, expenseToRevenueRatio, receivablePressureRatio, repaymentLoadRatio, recentNetCashFlow: recentMetrics.netCashFlow, previousNetCashFlow: previousMetrics.netCashFlow, warnings };
}
