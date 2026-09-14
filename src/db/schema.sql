CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  legal_name TEXT NOT NULL,
  display_name TEXT,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id)
);

CREATE TABLE IF NOT EXISTS financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id)
);

ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE financial_events SET payload_hash = encode(digest(payload::text, 'sha256'), 'hex')
WHERE payload_hash IS NULL;

ALTER TABLE financial_events ALTER COLUMN payload_hash SET NOT NULL;

CREATE TABLE IF NOT EXISTS twin_state (
  business_id UUID PRIMARY KEY REFERENCES businesses(id),
  version BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_available',
  as_of TIMESTAMPTZ,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS twin_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  event_id UUID REFERENCES financial_events(id),
  version BIGINT NOT NULL,
  status TEXT NOT NULL,
  as_of TIMESTAMPTZ,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, version)
);

CREATE INDEX IF NOT EXISTS financial_events_business_occurred_idx
  ON financial_events (business_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS financial_events_queue_idx
  ON financial_events (status, next_attempt_at, received_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS twin_state_history_business_created_idx
  ON twin_state_history (business_id, created_at DESC);
