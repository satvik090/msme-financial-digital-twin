from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, mean_absolute_error, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.features import (
    ANOMALY_FEATURES,
    FORECAST_FEATURES,
    RISK_FEATURES,
    add_anomaly_features,
    make_forecast_training_rows,
    make_risk_features,
    risk_label_from_features,
)

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODEL_DIR / "financial_intelligence.joblib"
METRICS_PATH = MODEL_DIR / "training_metrics.json"
MODEL_VERSION = "synthetic-v1"


def synthetic_series(rng: np.random.Generator, days: int, deteriorating: bool) -> pd.DataFrame:
    base_revenue = rng.uniform(15000, 90000)
    base_expense = rng.uniform(9000, 65000)
    cash_balance = rng.uniform(60000, 450000)
    rows = []

    for idx in range(days):
        date = pd.Timestamp("2025-01-01") + pd.Timedelta(days=idx)
        trend = idx / max(days - 1, 1)
        revenue_drift = 1.0 - (0.35 * trend if deteriorating else -0.08 * trend)
        expense_drift = 1.0 + (0.35 * trend if deteriorating else 0.05 * trend)
        weekday_factor = 1.25 if date.dayofweek < 5 else 0.45
        revenue = max(0.0, rng.normal(base_revenue * revenue_drift * weekday_factor, base_revenue * 0.18))
        expenses = max(0.0, rng.normal(base_expense * expense_drift, base_expense * 0.16))
        repayments = max(0.0, rng.normal(base_revenue * 0.12, base_revenue * 0.04)) if idx % 14 == 0 else 0.0
        receivables = max(0.0, rng.normal(base_revenue * 0.35, base_revenue * 0.08)) if idx % 9 == 0 else 0.0
        payables = max(0.0, rng.normal(base_expense * 0.3, base_expense * 0.08)) if idx % 11 == 0 else 0.0

        if rng.random() < 0.025:
            expenses *= rng.uniform(2.2, 4.0)
        if rng.random() < 0.02:
            revenue *= rng.uniform(0.0, 0.25)

        inflows = revenue
        outflows = expenses + repayments
        net_cash_flow = inflows - outflows
        cash_balance += net_cash_flow
        rows.append(
            {
                "date": date.date(),
                "inflows": inflows,
                "outflows": outflows,
                "revenue": revenue,
                "expenses": expenses,
                "receivables": receivables,
                "payables": payables,
                "repayments": repayments,
                "net_cash_flow": net_cash_flow,
                "event_count": rng.integers(1, 6),
                "cash_balance": cash_balance,
            }
        )

    return pd.DataFrame(rows)


def build_training_data() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.DataFrame, pd.Series]:
    rng = np.random.default_rng(42)
    forecast_rows = []
    forecast_targets = []
    anomaly_rows = []
    risk_rows = []
    risk_targets = []

    for business_idx in range(180):
        deteriorating = business_idx % 4 == 0
        series = synthetic_series(rng, days=180, deteriorating=deteriorating)
        x_forecast, y_forecast = make_forecast_training_rows(series)
        forecast_rows.append(x_forecast)
        forecast_targets.append(y_forecast)
        anomaly_rows.append(add_anomaly_features(series)[ANOMALY_FEATURES])

        for idx in range(30, len(series), 7):
            window = series.iloc[:idx].copy()
            features = make_risk_features(window, float(series.loc[idx - 1, "cash_balance"]))
            risk_rows.append(features)
            risk_targets.append(risk_label_from_features(features))

    return (
        pd.concat(forecast_rows, ignore_index=True),
        pd.concat(forecast_targets, ignore_index=True),
        pd.concat(anomaly_rows, ignore_index=True),
        pd.DataFrame(risk_rows, columns=RISK_FEATURES),
        pd.Series(risk_targets, dtype=int),
    )


def train() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    x_forecast, y_forecast, x_anomaly, x_risk, y_risk = build_training_data()

    x_forecast_train, x_forecast_test, y_forecast_train, y_forecast_test = train_test_split(
        x_forecast, y_forecast, test_size=0.2, random_state=42
    )
    forecast_model = Pipeline([("scale", StandardScaler()), ("model", Ridge(alpha=2.0))])
    forecast_model.fit(x_forecast_train[FORECAST_FEATURES], y_forecast_train)
    forecast_predictions = forecast_model.predict(x_forecast_test[FORECAST_FEATURES])
    forecast_mae = float(mean_absolute_error(y_forecast_test, forecast_predictions))

    anomaly_model = Pipeline(
        [
            ("scale", StandardScaler()),
            ("model", IsolationForest(n_estimators=150, contamination=0.05, random_state=42)),
        ]
    )
    anomaly_model.fit(x_anomaly[ANOMALY_FEATURES])

    x_risk_train, x_risk_test, y_risk_train, y_risk_test = train_test_split(
        x_risk, y_risk, test_size=0.25, random_state=42, stratify=y_risk
    )
    risk_model = Pipeline([("scale", StandardScaler()), ("model", LogisticRegression(max_iter=1000))])
    risk_model.fit(x_risk_train[RISK_FEATURES], y_risk_train)
    risk_probabilities = risk_model.predict_proba(x_risk_test[RISK_FEATURES])[:, 1]
    risk_predictions = (risk_probabilities >= 0.5).astype(int)
    risk_auc = float(roc_auc_score(y_risk_test, risk_probabilities))
    risk_accuracy = float(accuracy_score(y_risk_test, risk_predictions))

    artifact = {
        "modelVersion": MODEL_VERSION,
        "forecastModel": forecast_model,
        "anomalyModel": anomaly_model,
        "riskModel": risk_model,
        "featureColumns": {
            "forecast": FORECAST_FEATURES,
            "anomaly": ANOMALY_FEATURES,
            "risk": RISK_FEATURES,
        },
        "metrics": {
            "forecastMae": forecast_mae,
            "riskAuc": risk_auc,
            "riskAccuracy": risk_accuracy,
            "trainingRows": {
                "forecast": int(len(x_forecast)),
                "anomaly": int(len(x_anomaly)),
                "risk": int(len(x_risk)),
            },
        },
    }
    joblib.dump(artifact, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(artifact["metrics"], indent=2), encoding="utf-8")
    print(f"Saved model artifact to {MODEL_PATH}")
    print(json.dumps(artifact["metrics"], indent=2))


if __name__ == "__main__":
    train()
