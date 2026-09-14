from __future__ import annotations

from fastapi import FastAPI

from app.model import FinancialIntelligenceModel
from app.schemas import PredictionRequest

app = FastAPI(title="MSME Financial Digital Twin ML Service", version="0.1.0")
model = FinancialIntelligenceModel.load_default()


@app.get("/")
def root() -> dict[str, object]:
    return {
        "service": "msme-financial-digital-twin-ml-service",
        "version": "0.1.0",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ready",
        "modelLoaded": model.model_loaded,
        "modelVersion": model.model_version,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    return model.predict(request)
