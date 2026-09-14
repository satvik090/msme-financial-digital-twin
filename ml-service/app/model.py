from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.features import (
    ANOMALY_FEATURES,
    FORECAST_FEATURES,
    RISK_FEATURES,
    add_anomaly_features,
    events_to_daily_frame,
    forecast_features_for_position,
    make_risk_features,
)
from app.schemas import PredictionRequest

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "financial_intelligence.joblib"


@dataclass
class FinancialIntelligenceModel:
    artifact: dict[str, Any] | None

    @classmethod
    def load_default(cls) -> "FinancialIntelligenceModel":
        if not MODEL_PATH.exists():
            return cls(artifact=None)
        return cls(artifact=joblib.load(MODEL_PATH))

    @property
    def model_version(self) -> str:
        if not self.artifact:
            return "fallback-rules"
        return str(self.artifact.get("modelVersion", "unknown"))

    @property
    def model_loaded(self) -> bool:
        return self.artifact is not None

    def predict(self, request: PredictionRequest) -> dict[str, Any]:
        daily = events_to_daily_frame(request.events)
        current_cash = cash_balance_from_state(request)
        forecast = self.forecast_cash_flow(daily, request.horizonDays, current_cash)
        anomaly_detection = self.detect_anomalies(daily)
        risk_trajectory = self.score_risk(daily, current_cash)
        return {
            "businessId": request.businessId,
            "generatedAt": request.generatedAt.isoformat(),
            "modelVersion": self.model_version,
            "dataWindow": {
                "startDate": None if daily.empty else pd.Timestamp(daily["date"].min()).date().isoformat(),
                "endDate": None if daily.empty else pd.Timestamp(daily["date"].max()).date().isoformat(),
                "eventCount": len(request.events),
                "activeDays": int((daily["event_count"] > 0).sum()) if not daily.empty else 0,
            },
            "forecast": forecast,
            "anomalyDetection": anomaly_detection,
            "riskTrajectory": risk_trajectory,
            "insights": build_insights(forecast, anomaly_detection, risk_trajectory, daily),
        }

    def forecast_cash_flow(self, daily: pd.DataFrame, horizon_days: int, current_cash: float | None) -> dict[str, Any]:
        if len(daily) < 14:
            return {
                "status": "insufficient_data",
                "method": "ridge_regression" if self.model_loaded else "moving_average_fallback",
                "horizonDays": horizon_days,
                "points": [],
                "expectedNetCashFlow": 0.0,
                "expectedEndingCashBalance": current_cash,
                "explanation": ["At least 14 calendar days of processed events are needed for a cash-flow forecast."],
            }

        history = daily.copy().reset_index(drop=True)
        predictions: list[float] = []
        last_date = pd.Timestamp(history.loc[len(history) - 1, "date"])
        residual_mae = model_metric(self.artifact, "forecastMae", fallback=float(history.tail(14)["net_cash_flow"].std(ddof=0) or 0.0))
        confidence = confidence_from_history(len(history), self.model_loaded)

        for step in range(horizon_days):
            idx = len(history) - 1
            features = forecast_features_for_position(history, idx)
            future_date = last_date + pd.Timedelta(days=step + 1)
            features["day_of_week"] = float(future_date.dayofweek)
            features["day_of_month"] = float(future_date.day)
            features["days_since_start"] = float(idx + step + 1)
            prediction = self.predict_next_net_cash_flow(features, history)
            predictions.append(prediction)
            history = pd.concat(
                [
                    history,
                    pd.DataFrame(
                        [
                            {
                                "date": future_date.date(),
                                "inflows": max(prediction, 0.0),
                                "outflows": max(-prediction, 0.0),
                                "revenue": max(prediction, 0.0),
                                "expenses": max(-prediction, 0.0),
                                "receivables": 0.0,
                                "payables": 0.0,
                                "repayments": 0.0,
                                "net_cash_flow": prediction,
                                "event_count": 0.0,
                            }
                        ]
                    ),
                ],
                ignore_index=True,
            )

        cumulative = 0.0
        points = []
        for step, prediction in enumerate(predictions, start=1):
            cumulative += prediction
            projected_cash = None if current_cash is None else current_cash + cumulative
            interval = max(residual_mae, float(np.std(predictions) if len(predictions) > 1 else 0.0))
            points.append(
                {
                    "date": (last_date + pd.Timedelta(days=step)).date().isoformat(),
                    "predictedNetCashFlow": round_float(prediction),
                    "projectedCashBalance": None if projected_cash is None else round_float(projected_cash),
                    "lowerBound": round_float(prediction - 1.65 * interval),
                    "upperBound": round_float(prediction + 1.65 * interval),
                    "confidence": confidence,
                }
            )

        expected_net = float(sum(predictions))
        return {
            "status": "ok" if self.model_loaded else "degraded",
            "method": "ridge_regression" if self.model_loaded else "moving_average_fallback",
            "horizonDays": horizon_days,
            "points": points,
            "expectedNetCashFlow": round_float(expected_net),
            "expectedEndingCashBalance": None if current_cash is None else round_float(current_cash + expected_net),
            "explanation": [
                "Forecast uses recent net-cash-flow lag and rolling-window features.",
                "The projected cash balance is current cash plus cumulative predicted net cash flow.",
            ],
        }

    def predict_next_net_cash_flow(self, features: dict[str, float], history: pd.DataFrame) -> float:
        if self.artifact:
            row = pd.DataFrame([features], columns=FORECAST_FEATURES)
            return float(self.artifact["forecastModel"].predict(row)[0])
        return float(history.tail(14)["net_cash_flow"].mean())

    def detect_anomalies(self, daily: pd.DataFrame) -> dict[str, Any]:
        if len(daily) < 21:
            return {
                "status": "insufficient_data",
                "method": "isolation_forest" if self.model_loaded else "rolling_zscore_fallback",
                "anomalies": [],
                "explanation": ["At least 21 calendar days are needed to compare behaviour against a rolling baseline."],
            }

        featured = add_anomaly_features(daily).reset_index(drop=True)
        recent = featured.tail(60).copy()
        if self.artifact:
            decision = self.artifact["anomalyModel"].decision_function(recent[ANOMALY_FEATURES])
            recent["model_score"] = np.maximum(0.0, -decision)
        else:
            recent["model_score"] = rolling_fallback_scores(featured).tail(len(recent)).to_numpy()

        anomalies = []
        for _, row in recent.iterrows():
            reasons = explain_anomaly(row, featured)
            score = float(row["model_score"])
            if score <= 0.0 and not reasons:
                continue
            severity = "high" if score > 0.08 or len(reasons) >= 3 else "medium" if score > 0.03 or len(reasons) >= 2 else "low"
            anomalies.append(
                {
                    "date": pd.Timestamp(row["date"]).date().isoformat(),
                    "anomalyScore": round_float(max(score, 0.01 * len(reasons)), digits=4),
                    "severity": severity,
                    "observed": {
                        "inflows": round_float(row["inflows"]),
                        "outflows": round_float(row["outflows"]),
                        "revenue": round_float(row["revenue"]),
                        "expenses": round_float(row["expenses"]),
                        "netCashFlow": round_float(row["net_cash_flow"]),
                        "eventCount": int(row["event_count"]),
                    },
                    "reasons": reasons or ["Daily financial pattern is unusual relative to synthetic MSME behaviour."],
                }
            )

        anomalies.sort(key=lambda item: item["anomalyScore"], reverse=True)
        return {
            "status": "ok" if self.model_loaded else "degraded",
            "method": "isolation_forest" if self.model_loaded else "rolling_zscore_fallback",
            "anomalies": anomalies[:10],
            "explanation": [
                "Anomaly detection runs on daily inflow, outflow, revenue, expense, repayment and activity features.",
                "Reasons are rule explanations layered on top of the anomaly score for human review.",
            ],
        }

    def score_risk(self, daily: pd.DataFrame, current_cash: float | None) -> dict[str, Any]:
        if len(daily) < 14 or current_cash is None:
            return {
                "riskScore": None,
                "riskBand": "unknown",
                "trajectory": "unknown",
                "confidence": "low",
                "drivers": ["Insufficient processed history or missing current cash balance."],
                "nextReviewRecommendation": "Continue event collection before relying on ML risk trajectory signals.",
            }

        features = make_risk_features(daily, current_cash)
        if self.artifact:
            row = pd.DataFrame([features], columns=RISK_FEATURES)
            risk_score = float(self.artifact["riskModel"].predict_proba(row)[0, 1])
        else:
            risk_score = fallback_risk_score(features)

        risk_band = "critical" if risk_score >= 0.75 else "watch" if risk_score >= 0.45 else "stable"
        trajectory = "deteriorating" if features["trend_delta"] < 0 and risk_score >= 0.45 else "improving" if features["trend_delta"] > 0 and risk_score < 0.45 else "stable"
        return {
            "riskScore": round_float(risk_score, digits=4),
            "riskBand": risk_band,
            "trajectory": trajectory,
            "confidence": confidence_from_history(len(daily), self.model_loaded),
            "drivers": risk_drivers(features),
            "nextReviewRecommendation": review_recommendation(risk_band),
        }


def cash_balance_from_state(request: PredictionRequest) -> float | None:
    if request.currentState is None:
        return None
    value = request.currentState.health.get("cashBalance")
    return float(value) if isinstance(value, int | float) else None


def model_metric(artifact: dict[str, Any] | None, name: str, fallback: float) -> float:
    if not artifact:
        return fallback
    return float(artifact.get("metrics", {}).get(name, fallback))


def confidence_from_history(days: int, model_loaded: bool) -> str:
    if days >= 90 and model_loaded:
        return "high"
    if days >= 30:
        return "medium"
    return "low"


def round_float(value: Any, digits: int = 2) -> float:
    return round(float(value), digits)


def rolling_fallback_scores(featured: pd.DataFrame) -> pd.Series:
    net = featured["net_cash_flow"].astype(float)
    baseline = net.rolling(14, min_periods=7).mean()
    spread = net.rolling(14, min_periods=7).std(ddof=0).replace(0, np.nan)
    zscore = ((net - baseline).abs() / spread).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return (zscore / 10.0).clip(upper=1.0)


def explain_anomaly(row: pd.Series, featured: pd.DataFrame) -> list[str]:
    prior = featured[pd.to_datetime(featured["date"]) < pd.Timestamp(row["date"])].tail(14)
    if prior.empty:
        return []
    reasons: list[str] = []
    avg_outflow = float(prior["outflows"].mean())
    avg_inflow = float(prior["inflows"].mean())
    avg_event_count = float(prior["event_count"].mean())
    if avg_outflow > 0 and float(row["outflows"]) > avg_outflow * 2.0:
        reasons.append("Outflows are more than 2x the recent daily average.")
    if avg_inflow > 0 and float(row["inflows"]) < avg_inflow * 0.35:
        reasons.append("Inflows dropped sharply versus the recent baseline.")
    if float(row["net_cash_flow"]) < -max(avg_outflow, 1.0):
        reasons.append("Net cash flow is strongly negative for the day.")
    if float(row["expenses"]) > max(float(prior["expenses"].mean()) * 2.0, 1.0):
        reasons.append("Expense activity spiked compared with recent expense levels.")
    if avg_event_count > 0 and float(row["event_count"]) > avg_event_count * 2.5:
        reasons.append("Event volume is unusually high for this business.")
    return reasons


def fallback_risk_score(features: dict[str, float]) -> float:
    score = 0.15
    if features["cash_balance"] < 0:
        score += 0.35
    if features["runway_days"] < 30:
        score += 0.25
    if features["trend_delta"] < 0:
        score += 0.15
    if features["expense_to_revenue"] > 1.0:
        score += 0.15
    if features["repayment_load"] > 0.35:
        score += 0.1
    return min(score, 0.98)


def risk_drivers(features: dict[str, float]) -> list[str]:
    drivers: list[str] = []
    if features["cash_balance"] < 0:
        drivers.append("Current cash balance is negative.")
    if features["runway_days"] < 30:
        drivers.append("Estimated cash runway is below 30 days.")
    if features["trend_delta"] < 0:
        drivers.append("Recent 7-day net cash flow is weaker than the previous 7-day period.")
    if features["expense_to_revenue"] > 1.0:
        drivers.append("Recent expenses exceed recent revenue.")
    if features["repayment_load"] > 0.35:
        drivers.append("Repayments consume a high share of recent inflows.")
    if not drivers:
        drivers.append("No major deterioration driver detected in the recent window.")
    return drivers


def review_recommendation(risk_band: str) -> str:
    if risk_band == "critical":
        return "Review immediately and verify recent cash, collections and repayment events."
    if risk_band == "watch":
        return "Review during the next monitoring cycle and check the highlighted drivers."
    return "Continue standard monitoring."


def build_insights(forecast: dict[str, Any], anomaly_detection: dict[str, Any], risk: dict[str, Any], daily: pd.DataFrame) -> dict[str, list[str]]:
    warnings: list[str] = []
    if daily.empty:
        warnings.append("No processed events were supplied to the ML service.")
    elif int((daily["event_count"] > 0).sum()) < 14:
        warnings.append("Few active event days are available, so confidence is limited.")
    if forecast["status"] != "ok":
        warnings.append("Cash-flow forecast is limited because the trained model is unavailable or history is short.")

    summary = [
        f"Risk band is {risk['riskBand']} with trajectory {risk['trajectory']}.",
        f"Forecasted net cash flow over the horizon is {forecast['expectedNetCashFlow']}.",
        f"Detected {len(anomaly_detection['anomalies'])} recent anomaly candidates.",
    ]
    actions = [
        "Inspect high-severity anomaly days before making lender-facing decisions.",
        "Compare projected cash balance with upcoming repayment obligations.",
    ]
    if risk["riskBand"] in {"watch", "critical"}:
        actions.append("Prioritize borrower outreach or document verification for the listed risk drivers.")
    return { "summary": summary, "operationalActions": actions, "dataQualityWarnings": warnings }
