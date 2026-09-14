from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

FinancialEventType = Literal["transaction", "revenue", "expense", "receivable", "payable", "repayment", "other"]
EventDirection = Literal["inflow", "outflow"]


class FinancialEvent(BaseModel):
    id: str
    type: FinancialEventType
    occurredAt: datetime
    amount: float = Field(gt=0)
    direction: EventDirection
    currency: str


class CurrentState(BaseModel):
    status: str
    asOf: datetime | None = None
    health: dict[str, Any] = Field(default_factory=dict)


class PredictionRequest(BaseModel):
    businessId: str
    generatedAt: datetime
    horizonDays: int = Field(default=30, ge=1, le=90)
    currentState: CurrentState | None = None
    events: list[FinancialEvent] = Field(default_factory=list)
