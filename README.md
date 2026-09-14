# MSME Financial Digital Twin API

Backend foundation for the financial intelligence layer. It provides a typed Express API, PostgreSQL-backed business and financial-event records, request validation, structured logging, liveness/readiness checks, and a database-backed asynchronous event worker.

## One-command product demo

With Docker Desktop running:

```powershell
docker compose up --build
```

Open `http://localhost:8080`. This launches PostgreSQL, the API, ML service, and browser UI as one application. The UI includes MSME creation, financial-event entry, and guided 30-day scenarios. Docker Compose enables `DEMO_MODE` so an interview demo works without an identity provider; disable it and configure real authentication before public deployment.

## Local setup

1. Copy `.env.example` to `.env` and point `DATABASE_URL` at PostgreSQL.
2. Install dependencies with `npm install`.
3. Apply the schema with `npm run db:migrate`.
4. Start development mode with `npm run dev`.

Optional ML service setup:

```powershell
npm run ml:install
npm run ml:train
npm run ml:dev
```

The ML service runs separately on `http://127.0.0.1:8000` by default. The Node API calls it through `ML_SERVICE_URL`; if it is not running, only ML-specific endpoints fail while the core backend remains usable.

Endpoints:

- `GET /health/live` — process liveness
- `GET /health/ready` — database readiness
- `GET /health/ml` — ML-service readiness
- `GET /api/v1/businesses`
- `POST /api/v1/businesses`
- `GET /api/v1/businesses/:id`
- `POST /api/v1/businesses/:id/events` — accepts a financial signal and returns `202 Accepted` after durable enqueueing
- `GET /api/v1/businesses/:id/twin` — returns the current projected financial state
- `GET /api/v1/businesses/:id/intelligence?days=90&bucket=day` — returns dashboard aggregates, trends, and explainable health indicators
- `GET /api/v1/businesses/:id/ml-intelligence?days=180&horizonDays=30` — calls the ML service for forecasting, anomaly detection, and risk trajectory signals
- `GET /api/v1/businesses/:id/events?limit=50&offset=0` — returns processed historical events
- `GET /api/v1/businesses/:id/twin/history?limit=50` — returns state snapshots created by event processing

Example event body:

```json
{
  "type": "revenue",
  "source": "lender-ledger",
  "sourceEventId": "ledger-entry-123",
  "occurredAt": "2026-09-13T10:30:00.000Z",
  "amount": 125000,
  "direction": "inflow",
  "currency": "INR",
  "description": "Invoice settlement",
  "metadata": { "invoiceId": "INV-123" }
}
```

The database is the source of truth. `financial_events` is also the durable work queue for this first asynchronous vertical slice. Ingestion is transactional and idempotent on `(source, sourceEventId)`; the worker claims pending rows with PostgreSQL row locking, applies each event to `twin_state`, records a snapshot in `twin_state_history`, retries transient failures with exponential backoff, and marks exhausted events as `dead_letter`.

The state projection is deliberately explainable: cash is the sum of inflows minus outflows, category totals are the sum of their event amounts, and dashboard health indicators are ratios/runway calculations over the persisted state and a requested historical window. Receivable and payable totals currently mean recorded amounts; settlement matching is intentionally deferred.

The ML layer is deliberately separate from the Express business layer. Node supplies current twin state plus processed event history to the Python service. The service converts events into daily features, returns cash-flow forecasts, anomaly candidates, risk trajectory signals, and human-readable drivers. The included training workflow uses synthetic MSME behaviour and writes a local model artifact for demonstration.

Authentication, caching, Angular, and final optimization remain intentionally reserved for later vertical slices.
