from __future__ import annotations

from datetime import date
from typing import Iterable

import numpy as np
import pandas as pd

from app.schemas import FinancialEvent

DAILY_COLUMNS = [
    "inflows",
    "outflows",
    "revenue",
    "expenses",
    "receivables",
    "payables",
    "repayments",
    "net_cash_flow",
    "event_count",
]

FORECAST_FEATURES = [
    "day_of_week",
    "day_of_month",
    "days_since_start",
    "lag_1_net",
    "lag_7_net",
    "rolling_7_net",
    "rolling_14_net",
    "rolling_7_inflows",
    "rolling_7_outflows",
    "rolling_7_event_count",
]

ANOMALY_FEATURES = [
    "inflows",
    "outflows",
    "revenue",
    "expenses",
    "receivables",
    "payables",
    "repayments",
    "net_cash_flow",
    "event_count",
    "absolute_flow",
    "expense_to_revenue",
]

RISK_FEATURES = [
    "cash_balance",
    "recent_7_net",
    "previous_7_net",
    "trend_delta",
    "recent_7_inflows",
    "recent_7_outflows",
    "expense_to_revenue",
    "repayment_load",
    "receivable_pressure",
    "volatility_14",
    "runway_days",
]


def empty_daily_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=["date", *DAILY_COLUMNS])


def events_to_daily_frame(events: Iterable[FinancialEvent]) -> pd.DataFrame:
    rows: list[dict[str, float | date]] = []
    for event in events:
        amount = float(event.amount)
        inflow = amount if event.direction == "inflow" else 0.0
        outflow = amount if event.direction == "outflow" else 0.0
        rows.append(
            {
                "date": pd.Timestamp(event.occurredAt).tz_convert("UTC").normalize().date(),
                "inflows": inflow,
                "outflows": outflow,
                "revenue": amount if event.type == "revenue" else 0.0,
                "expenses": amount if event.type == "expense" else 0.0,
                "receivables": amount if event.type == "receivable" else 0.0,
                "payables": amount if event.type == "payable" else 0.0,
                "repayments": amount if event.type == "repayment" else 0.0,
                "net_cash_flow": inflow - outflow,
                "event_count": 1.0,
            }
        )
    if not rows:
        return empty_daily_frame()

    raw = pd.DataFrame(rows)
    grouped = raw.groupby("date", as_index=True)[DAILY_COLUMNS].sum().sort_index()
    index = pd.date_range(grouped.index.min(), grouped.index.max(), freq="D").date
    daily = grouped.reindex(index, fill_value=0.0)
    daily.index.name = "date"
    return daily.reset_index()


def add_anomaly_features(daily: pd.DataFrame) -> pd.DataFrame:
    features = daily.copy()
    features["absolute_flow"] = features["inflows"] + features["outflows"]
    features["expense_to_revenue"] = features["expenses"] / features["revenue"].replace(0, np.nan)
    features["expense_to_revenue"] = features["expense_to_revenue"].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return features


def make_forecast_training_rows(series: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    rows = []
    targets = []
    values = series.reset_index(drop=True)
    for idx in range(14, len(values) - 1):
        rows.append(forecast_features_for_position(values, idx))
        targets.append(float(values.loc[idx + 1, "net_cash_flow"]))
    return pd.DataFrame(rows, columns=FORECAST_FEATURES), pd.Series(targets, dtype=float)


def forecast_features_for_position(series: pd.DataFrame, idx: int) -> dict[str, float]:
    current_date = pd.Timestamp(series.loc[idx, "date"])
    net = series["net_cash_flow"].astype(float)
    return {
        "day_of_week": float(current_date.dayofweek),
        "day_of_month": float(current_date.day),
        "days_since_start": float(idx),
        "lag_1_net": float(net.iloc[idx]),
        "lag_7_net": float(net.iloc[idx - 6]) if idx >= 6 else 0.0,
        "rolling_7_net": float(net.iloc[max(0, idx - 6) : idx + 1].mean()),
        "rolling_14_net": float(net.iloc[max(0, idx - 13) : idx + 1].mean()),
        "rolling_7_inflows": float(series["inflows"].iloc[max(0, idx - 6) : idx + 1].mean()),
        "rolling_7_outflows": float(series["outflows"].iloc[max(0, idx - 6) : idx + 1].mean()),
        "rolling_7_event_count": float(series["event_count"].iloc[max(0, idx - 6) : idx + 1].mean()),
    }


def make_risk_features(daily: pd.DataFrame, cash_balance: float) -> dict[str, float]:
    if daily.empty:
        return {name: 0.0 for name in RISK_FEATURES}

    recent = daily.tail(7)
    previous = daily.iloc[max(0, len(daily) - 14) : max(0, len(daily) - 7)]
    recent_7_net = float(recent["net_cash_flow"].sum())
    previous_7_net = float(previous["net_cash_flow"].sum()) if not previous.empty else 0.0
    recent_7_inflows = float(recent["inflows"].sum())
    recent_7_outflows = float(recent["outflows"].sum())
    revenue_30 = float(daily.tail(30)["revenue"].sum())
    expenses_30 = float(daily.tail(30)["expenses"].sum())
    repayments_30 = float(daily.tail(30)["repayments"].sum())
    receivables_30 = float(daily.tail(30)["receivables"].sum())
    avg_daily_outflow = recent_7_outflows / max(len(recent), 1)
    runway_days = cash_balance / avg_daily_outflow if avg_daily_outflow > 0 else 365.0
    return {
        "cash_balance": float(cash_balance),
        "recent_7_net": recent_7_net,
        "previous_7_net": previous_7_net,
        "trend_delta": recent_7_net - previous_7_net,
        "recent_7_inflows": recent_7_inflows,
        "recent_7_outflows": recent_7_outflows,
        "expense_to_revenue": expenses_30 / revenue_30 if revenue_30 > 0 else 0.0,
        "repayment_load": repayments_30 / recent_7_inflows if recent_7_inflows > 0 else 0.0,
        "receivable_pressure": receivables_30 / revenue_30 if revenue_30 > 0 else 0.0,
        "volatility_14": float(daily.tail(14)["net_cash_flow"].std(ddof=0) or 0.0),
        "runway_days": min(float(runway_days), 365.0),
    }


def risk_label_from_features(features: dict[str, float]) -> int:
    score = 0
    if features["cash_balance"] < 0:
        score += 3
    if features["runway_days"] < 21:
        score += 2
    if features["trend_delta"] < -25000:
        score += 1
    if features["expense_to_revenue"] > 1.1:
        score += 1
    if features["repayment_load"] > 0.35:
        score += 1
    if features["volatility_14"] > max(abs(features["recent_7_net"]), 1.0):
        score += 1
    return 1 if score >= 3 else 0
