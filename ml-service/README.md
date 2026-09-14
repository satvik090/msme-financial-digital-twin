# MSME Financial Digital Twin ML Service

This service is intentionally separate from the Node/Express API. The backend supplies processed financial events and current twin state over HTTP; this service prepares features and returns explainable prediction outputs.

## Local setup

```powershell
npm run ml:install
npm run ml:train
npm run ml:dev
```

The training command creates `ml-service/models/financial_intelligence.joblib` from synthetic MSME daily cash-flow data. If the artifact is missing, the API still starts with transparent fallback rules, but responses are marked as degraded.

## Models

- Cash-flow forecasting: Ridge regression over lagged and rolling net-cash-flow features.
- Anomaly detection: Isolation Forest over daily financial activity features.
- Risk trajectory: Logistic regression over recent trend, runway, repayment-load and ratio features.

These are monitoring models, not a production credit-decision system.
