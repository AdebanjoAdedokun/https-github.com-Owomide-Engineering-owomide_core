-- Migration: 0002_catalog_foundation
-- Service: catalog
-- PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION catalog.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

CREATE FUNCTION catalog.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE catalog.product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  manufacturer text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX product_org_category_idx ON catalog.product (org_id, category, id)
  WHERE archived_at IS NULL;

CREATE TRIGGER product_set_updated_at
BEFORE UPDATE ON catalog.product
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

CREATE TABLE catalog.sku (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  product_id uuid,
  sku_code text NOT NULL CHECK (btrim(sku_code) <> ''),
  sku_code_normalized text NOT NULL CHECK (btrim(sku_code_normalized) <> ''),
  pack_size integer CHECK (pack_size IS NULL OR pack_size > 0),
  unit text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, product_id) REFERENCES catalog.product (org_id, id)
);

CREATE UNIQUE INDEX sku_org_code_active_uq
  ON catalog.sku (org_id, sku_code_normalized)
  WHERE archived_at IS NULL;
CREATE INDEX sku_org_product_idx ON catalog.sku (org_id, product_id, id)
  WHERE archived_at IS NULL;
CREATE INDEX sku_org_code_search_idx ON catalog.sku (org_id, sku_code_normalized text_pattern_ops, id)
  WHERE archived_at IS NULL;

CREATE TRIGGER sku_set_updated_at
BEFORE UPDATE ON catalog.sku
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

CREATE TABLE catalog.sku_identifier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  sku_id uuid NOT NULL,
  identifier_type text NOT NULL CHECK (btrim(identifier_type) <> ''),
  namespace text NOT NULL DEFAULT '',
  raw_value text NOT NULL CHECK (btrim(raw_value) <> ''),
  normalized_value text NOT NULL CHECK (btrim(normalized_value) <> ''),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, sku_id) REFERENCES catalog.sku (org_id, id)
);

CREATE UNIQUE INDEX sku_identifier_org_value_active_uq
  ON catalog.sku_identifier (org_id, identifier_type, namespace, normalized_value)
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX sku_identifier_primary_active_uq
  ON catalog.sku_identifier (org_id, sku_id, identifier_type, namespace)
  WHERE archived_at IS NULL AND is_primary;
CREATE INDEX sku_identifier_org_sku_idx
  ON catalog.sku_identifier (org_id, sku_id, id)
  WHERE archived_at IS NULL;

CREATE TABLE catalog.channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  code text NOT NULL CHECK (btrim(code) <> ''),
  code_normalized text NOT NULL CHECK (btrim(code_normalized) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  default_currency text NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE UNIQUE INDEX channel_org_code_active_uq
  ON catalog.channel (org_id, code_normalized)
  WHERE archived_at IS NULL;

CREATE TRIGGER channel_set_updated_at
BEFORE UPDATE ON catalog.channel
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

CREATE TABLE catalog.location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  code text NOT NULL CHECK (btrim(code) <> ''),
  code_normalized text NOT NULL CHECK (btrim(code_normalized) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  region text,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE UNIQUE INDEX location_org_code_active_uq
  ON catalog.location (org_id, code_normalized)
  WHERE archived_at IS NULL;

CREATE TRIGGER location_set_updated_at
BEFORE UPDATE ON catalog.location
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

CREATE TABLE catalog.customer_segment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  code text NOT NULL CHECK (btrim(code) <> ''),
  code_normalized text NOT NULL CHECK (btrim(code_normalized) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE UNIQUE INDEX customer_segment_org_code_active_uq
  ON catalog.customer_segment (org_id, code_normalized)
  WHERE archived_at IS NULL;

CREATE TRIGGER customer_segment_set_updated_at
BEFORE UPDATE ON catalog.customer_segment
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

CREATE TABLE catalog.write_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  caller_service text NOT NULL CHECK (btrim(caller_service) <> ''),
  operation_type text NOT NULL CHECK (operation_type IN ('upsert_canonical', 'apply_price_changes')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('in_progress', 'succeeded')),
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE (org_id, id),
  UNIQUE (org_id, caller_service, idempotency_key),
  CHECK (
    (status = 'in_progress' AND completed_at IS NULL AND response_json IS NULL)
    OR (status = 'succeeded' AND completed_at IS NOT NULL AND response_json IS NOT NULL)
  )
);

CREATE INDEX write_operation_org_created_idx
  ON catalog.write_operation (org_id, created_at DESC, id);

CREATE TABLE catalog.cost_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  sku_id uuid NOT NULL,
  location_id uuid,
  cost_type text NOT NULL DEFAULT 'standard' CHECK (btrim(cost_type) <> ''),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  effective_at timestamptz NOT NULL,
  effective_until timestamptz,
  effective_period tstzrange GENERATED ALWAYS AS (
    tstzrange(effective_at, effective_until, '[)')
  ) STORED,
  recorded_at timestamptz NOT NULL,
  superseded_at timestamptz,
  source_type text NOT NULL CHECK (source_type IN ('import', 'proposal', 'manual', 'system', 'migration')),
  source_ref text NOT NULL CHECK (btrim(source_ref) <> ''),
  source_item_ref text NOT NULL CHECK (btrim(source_item_ref) <> ''),
  actor_id text,
  write_operation_id uuid NOT NULL,
  superseded_by_operation_id uuid,
  derived_from_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, sku_id) REFERENCES catalog.sku (org_id, id),
  FOREIGN KEY (org_id, location_id) REFERENCES catalog.location (org_id, id),
  FOREIGN KEY (org_id, write_operation_id) REFERENCES catalog.write_operation (org_id, id),
  FOREIGN KEY (org_id, superseded_by_operation_id) REFERENCES catalog.write_operation (org_id, id),
  FOREIGN KEY (org_id, derived_from_record_id) REFERENCES catalog.cost_record (org_id, id),
  CHECK (effective_until IS NULL OR effective_until > effective_at),
  CHECK (NOT isempty(effective_period)),
  CHECK (superseded_at IS NULL OR superseded_at >= recorded_at),
  CHECK ((superseded_at IS NULL) = (superseded_by_operation_id IS NULL)),
  EXCLUDE USING gist (
    org_id WITH =,
    sku_id WITH =,
    (COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    cost_type WITH =,
    currency WITH =,
    effective_period WITH &&
  ) WHERE (superseded_at IS NULL)
);

CREATE INDEX cost_record_current_lookup_idx
  ON catalog.cost_record (org_id, sku_id, cost_type, currency, effective_at DESC)
  WHERE superseded_at IS NULL;
CREATE INDEX cost_record_recorded_lookup_idx
  ON catalog.cost_record (org_id, sku_id, recorded_at DESC, superseded_at);
CREATE INDEX cost_record_effective_period_idx
  ON catalog.cost_record USING gist (effective_period);

CREATE TABLE catalog.price_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  sku_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  location_id uuid,
  customer_segment_id uuid,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  effective_at timestamptz NOT NULL,
  effective_until timestamptz,
  effective_period tstzrange GENERATED ALWAYS AS (
    tstzrange(effective_at, effective_until, '[)')
  ) STORED,
  recorded_at timestamptz NOT NULL,
  superseded_at timestamptz,
  source_type text NOT NULL CHECK (source_type IN ('import', 'proposal', 'manual', 'system', 'migration')),
  source_ref text NOT NULL CHECK (btrim(source_ref) <> ''),
  source_item_ref text NOT NULL CHECK (btrim(source_item_ref) <> ''),
  actor_id text,
  write_operation_id uuid NOT NULL,
  superseded_by_operation_id uuid,
  derived_from_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, sku_id) REFERENCES catalog.sku (org_id, id),
  FOREIGN KEY (org_id, channel_id) REFERENCES catalog.channel (org_id, id),
  FOREIGN KEY (org_id, location_id) REFERENCES catalog.location (org_id, id),
  FOREIGN KEY (org_id, customer_segment_id) REFERENCES catalog.customer_segment (org_id, id),
  FOREIGN KEY (org_id, write_operation_id) REFERENCES catalog.write_operation (org_id, id),
  FOREIGN KEY (org_id, superseded_by_operation_id) REFERENCES catalog.write_operation (org_id, id),
  FOREIGN KEY (org_id, derived_from_record_id) REFERENCES catalog.price_record (org_id, id),
  CHECK (effective_until IS NULL OR effective_until > effective_at),
  CHECK (NOT isempty(effective_period)),
  CHECK (superseded_at IS NULL OR superseded_at >= recorded_at),
  CHECK ((superseded_at IS NULL) = (superseded_by_operation_id IS NULL)),
  EXCLUDE USING gist (
    org_id WITH =,
    sku_id WITH =,
    channel_id WITH =,
    (COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    (COALESCE(customer_segment_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    currency WITH =,
    effective_period WITH &&
  ) WHERE (superseded_at IS NULL)
);

CREATE INDEX price_record_current_lookup_idx
  ON catalog.price_record (org_id, sku_id, channel_id, currency, effective_at DESC)
  WHERE superseded_at IS NULL;
CREATE INDEX price_record_recorded_lookup_idx
  ON catalog.price_record (org_id, sku_id, recorded_at DESC, superseded_at);
CREATE INDEX price_record_effective_period_idx
  ON catalog.price_record USING gist (effective_period);

CREATE FUNCTION catalog.enforce_economic_record_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    to_jsonb(NEW) - 'superseded_at' - 'superseded_by_operation_id' - 'effective_period'
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - 'superseded_at' - 'superseded_by_operation_id' - 'effective_period'
  ) THEN
    RAISE EXCEPTION 'economic records are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.superseded_at IS NOT NULL
    OR NEW.superseded_at IS NULL
    OR NEW.superseded_by_operation_id IS NULL THEN
    RAISE EXCEPTION 'economic records may only be superseded once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_record_immutable
BEFORE UPDATE ON catalog.cost_record
FOR EACH ROW EXECUTE FUNCTION catalog.enforce_economic_record_immutability();

CREATE TRIGGER price_record_immutable
BEFORE UPDATE ON catalog.price_record
FOR EACH ROW EXECUTE FUNCTION catalog.enforce_economic_record_immutability();

CREATE TABLE catalog.outbox_event (
  id uuid PRIMARY KEY,
  org_id text NOT NULL CHECK (btrim(org_id) <> ''),
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  aggregate_type text NOT NULL CHECK (btrim(aggregate_type) <> ''),
  aggregate_id text NOT NULL CHECK (btrim(aggregate_id) <> ''),
  partition_key text NOT NULL CHECK (btrim(partition_key) <> ''),
  payload bytea NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  published_at timestamptz,
  last_error text,
  UNIQUE (org_id, id)
);

CREATE INDEX outbox_event_pending_idx
  ON catalog.outbox_event (available_at, occurred_at, id)
  WHERE published_at IS NULL;

CREATE FUNCTION catalog.claim_outbox_events(p_limit integer, p_lease_seconds integer DEFAULT 30)
RETURNS SETOF catalog.outbox_event
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
  WITH claimed AS (
    SELECT id
    FROM catalog.outbox_event
    WHERE published_at IS NULL
      AND available_at <= clock_timestamp()
    ORDER BY occurred_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  UPDATE catalog.outbox_event AS event
  SET attempts = event.attempts + 1,
      available_at = clock_timestamp() + make_interval(secs => GREATEST(1, p_lease_seconds))
  FROM claimed
  WHERE event.id = claimed.id
  RETURNING event.*;
$$;

CREATE FUNCTION catalog.mark_outbox_published(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
  UPDATE catalog.outbox_event
  SET published_at = clock_timestamp(),
      last_error = NULL
  WHERE id = p_id AND published_at IS NULL;
$$;

CREATE FUNCTION catalog.mark_outbox_failed(p_id uuid, p_error text, p_retry_seconds integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
  UPDATE catalog.outbox_event
  SET last_error = left(p_error, 2000),
      available_at = clock_timestamp() + make_interval(secs => GREATEST(1, p_retry_seconds))
  WHERE id = p_id AND published_at IS NULL;
$$;

ALTER TABLE catalog.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.product FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.sku ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.sku FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.sku_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.sku_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.channel FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.location ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.location FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.customer_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.customer_segment FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.write_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.write_operation FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.cost_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.cost_record FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.price_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.price_record FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.outbox_event FORCE ROW LEVEL SECURITY;

CREATE POLICY product_tenant_policy ON catalog.product
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY sku_tenant_policy ON catalog.sku
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY sku_identifier_tenant_policy ON catalog.sku_identifier
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY channel_tenant_policy ON catalog.channel
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY location_tenant_policy ON catalog.location
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY customer_segment_tenant_policy ON catalog.customer_segment
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY write_operation_tenant_policy ON catalog.write_operation
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY cost_record_tenant_policy ON catalog.cost_record
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY price_record_tenant_policy ON catalog.price_record
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());
CREATE POLICY outbox_event_tenant_policy ON catalog.outbox_event
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());

REVOKE ALL ON FUNCTION catalog.claim_outbox_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.mark_outbox_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.mark_outbox_failed(uuid, text, integer) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO catalog_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA catalog TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.current_org_id() TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.claim_outbox_events(integer, integer) TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.mark_outbox_published(uuid) TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.mark_outbox_failed(uuid, text, integer) TO catalog_svc;

REVOKE DELETE ON ALL TABLES IN SCHEMA catalog FROM catalog_svc;
REVOKE UPDATE ON catalog.outbox_event FROM catalog_svc;
