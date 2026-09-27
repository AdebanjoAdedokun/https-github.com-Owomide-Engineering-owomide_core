-- Migration: 0003_tax_basis_cost_unit_resolution
-- Service: catalog
-- PostgreSQL 16+
--
-- ADR-016 sections 1, 2, 3 and 5; decision D-04 (VAT-inclusive 7.5%, landed cost); PRD DATA-003,
-- DATA-004, DATA-022.
--
-- 1. Every price record states its tax basis. Existing rows, and rows written before the write
--    path carries the basis, are 'unspecified' (tax_inclusive NULL). They are never guessed to be
--    tax-exclusive: resolution reports TAX_BASIS_MISSING for them instead.
-- 2. Every cost record carries a unit.
-- 3. Each organisation has one pricing settings row: default tax basis and rate, the cost basis
--    used for calculations, and the organisation-wide default channel.
-- 4. Two read functions answer "the Current Price for this exact context at this time" and "the
--    Applicable Unit Cost for the configured basis", with a reason code when there is no answer.

-- 1. Tax basis on price records ------------------------------------------------------------------

ALTER TABLE catalog.price_record
  ADD COLUMN tax_inclusive boolean,
  ADD COLUMN tax_rate_bp integer CHECK (tax_rate_bp IS NULL OR tax_rate_bp BETWEEN 0 AND 10000),
  ADD COLUMN tax_basis_source text NOT NULL DEFAULT 'unspecified'
    CHECK (tax_basis_source IN ('explicit', 'organisation_default', 'unspecified')),
  ADD CONSTRAINT price_record_tax_basis_consistent
    CHECK ((tax_inclusive IS NULL) = (tax_basis_source = 'unspecified')),
  ADD CONSTRAINT price_record_tax_rate_needs_basis
    CHECK (tax_rate_bp IS NULL OR tax_inclusive IS NOT NULL);

-- 2. Unit on cost records ------------------------------------------------------------------------

ALTER TABLE catalog.cost_record
  ADD COLUMN unit text NOT NULL DEFAULT 'each'
    CHECK (unit ~ '^[a-z][a-z0-9_]{0,31}$');

-- 3. Organisation pricing settings ---------------------------------------------------------------

CREATE TABLE catalog.pricing_settings (
  org_id text PRIMARY KEY CHECK (btrim(org_id) <> ''),
  default_tax_inclusive boolean,
  default_tax_rate_bp integer CHECK (default_tax_rate_bp IS NULL OR default_tax_rate_bp BETWEEN 0 AND 10000),
  calculation_cost_basis text NOT NULL CHECK (calculation_cost_basis ~ '^[a-z][a-z0-9_]{0,31}$'),
  default_channel_id uuid NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (org_id, default_channel_id) REFERENCES catalog.channel (org_id, id),
  -- An inclusive default without a rate would make every defaulted price uncomputable.
  CHECK (default_tax_inclusive IS NOT TRUE OR default_tax_rate_bp IS NOT NULL),
  CHECK (default_tax_rate_bp IS NULL OR default_tax_inclusive IS NOT NULL)
);

CREATE TRIGGER pricing_settings_set_updated_at
BEFORE UPDATE ON catalog.pricing_settings
FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

ALTER TABLE catalog.pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.pricing_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY pricing_settings_tenant_policy ON catalog.pricing_settings
  USING (org_id = catalog.current_org_id()) WITH CHECK (org_id = catalog.current_org_id());

-- Creates or updates the tenant's settings and makes sure the 'default' channel exists.
-- Runs as the caller, so row-level security applies. Returns the default channel id.
CREATE FUNCTION catalog.configure_pricing_settings(
  p_default_tax_inclusive boolean,
  p_default_tax_rate_bp integer,
  p_calculation_cost_basis text,
  p_default_currency text,
  p_actor_id text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, catalog
AS $$
DECLARE
  v_org text := catalog.current_org_id();
  v_channel uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'app.org_id is not set' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_channel
  FROM catalog.channel
  WHERE org_id = v_org AND code_normalized = 'default' AND archived_at IS NULL;

  IF v_channel IS NULL THEN
    INSERT INTO catalog.channel (org_id, code, code_normalized, name, default_currency)
    VALUES (v_org, 'default', 'default', 'Organisation-wide price', p_default_currency)
    RETURNING id INTO v_channel;
  END IF;

  INSERT INTO catalog.pricing_settings (
    org_id, default_tax_inclusive, default_tax_rate_bp, calculation_cost_basis,
    default_channel_id, updated_by
  ) VALUES (
    v_org, p_default_tax_inclusive, p_default_tax_rate_bp, p_calculation_cost_basis,
    v_channel, p_actor_id
  )
  ON CONFLICT (org_id) DO UPDATE
  SET default_tax_inclusive = EXCLUDED.default_tax_inclusive,
      default_tax_rate_bp = EXCLUDED.default_tax_rate_bp,
      calculation_cost_basis = EXCLUDED.calculation_cost_basis,
      default_channel_id = EXCLUDED.default_channel_id,
      updated_by = EXCLUDED.updated_by;

  RETURN v_channel;
END;
$$;

-- A new price record that does not state its basis takes the organisation default at the moment
-- it is written, marked 'organisation_default'. Changing the default later never rewrites stored
-- records. Fragments (derived_from_record_id set) copy their parent exactly and are left alone.
CREATE FUNCTION catalog.apply_default_tax_basis()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings catalog.pricing_settings%ROWTYPE;
BEGIN
  IF NEW.tax_basis_source <> 'unspecified' OR NEW.derived_from_record_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_settings FROM catalog.pricing_settings WHERE org_id = NEW.org_id;
  IF FOUND AND v_settings.default_tax_inclusive IS NOT NULL THEN
    NEW.tax_inclusive := v_settings.default_tax_inclusive;
    NEW.tax_rate_bp := v_settings.default_tax_rate_bp;
    NEW.tax_basis_source := 'organisation_default';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER price_record_apply_default_tax_basis
BEFORE INSERT ON catalog.price_record
FOR EACH ROW EXECUTE FUNCTION catalog.apply_default_tax_basis();

-- 4. Resolution -----------------------------------------------------------------------------------

-- p_contexts: a JSON array of {"sku_id", "channel_id", "location_id"?, "customer_segment_id"?,
-- "currency"}. Returns exactly one row per element, in input order (ordinal starts at 1).
-- Exact context only: a price for another channel, location or segment is never borrowed.
-- A record is current when it is not superseded and its effective period contains p_at.
CREATE FUNCTION catalog.resolve_current_prices(p_contexts jsonb, p_at timestamptz)
RETURNS TABLE (
  ordinal bigint,
  sku_id uuid,
  channel_id uuid,
  location_id uuid,
  customer_segment_id uuid,
  currency text,
  price_record_id uuid,
  amount_minor bigint,
  tax_inclusive boolean,
  tax_rate_bp integer,
  tax_basis_source text,
  unavailable_reason text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, catalog
AS $$
  SELECT
    ctx.ordinal,
    ctx.sku_id,
    ctx.channel_id,
    ctx.location_id,
    ctx.customer_segment_id,
    ctx.currency,
    pr.id,
    pr.amount_minor,
    pr.tax_inclusive,
    pr.tax_rate_bp,
    pr.tax_basis_source,
    CASE
      WHEN pr.id IS NULL THEN 'NO_APPLICABLE_PRICE_RECORD'
      WHEN pr.tax_inclusive IS NULL THEN 'TAX_BASIS_MISSING'
      WHEN pr.tax_inclusive AND pr.tax_rate_bp IS NULL THEN 'TAX_RATE_MISSING_FOR_INCLUSIVE_PRICE'
    END
  FROM (
    SELECT
      e.ordinal,
      (e.elem->>'sku_id')::uuid AS sku_id,
      (e.elem->>'channel_id')::uuid AS channel_id,
      (e.elem->>'location_id')::uuid AS location_id,
      (e.elem->>'customer_segment_id')::uuid AS customer_segment_id,
      e.elem->>'currency' AS currency
    FROM jsonb_array_elements(p_contexts) WITH ORDINALITY AS e(elem, ordinal)
  ) ctx
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM catalog.price_record p
    WHERE p.sku_id = ctx.sku_id
      AND p.channel_id = ctx.channel_id
      AND p.location_id IS NOT DISTINCT FROM ctx.location_id
      AND p.customer_segment_id IS NOT DISTINCT FROM ctx.customer_segment_id
      AND p.currency = ctx.currency
      AND p.superseded_at IS NULL
      AND p.effective_period @> p_at
    LIMIT 1
  ) pr ON true
  ORDER BY ctx.ordinal;
$$;

-- p_contexts: a JSON array of {"sku_id", "location_id"?, "currency", "unit"?}. Returns one row per
-- element, in input order. Only records of the organisation's calculation_cost_basis are used.
-- A record for the exact location is preferred to a location-less one (convention C-6); a record
-- for a different location is never used.
CREATE FUNCTION catalog.resolve_applicable_costs(p_contexts jsonb, p_at timestamptz)
RETURNS TABLE (
  ordinal bigint,
  sku_id uuid,
  location_id uuid,
  currency text,
  cost_record_id uuid,
  cost_type text,
  amount_minor bigint,
  unit text,
  unavailable_reason text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, catalog
AS $$
  WITH settings AS (
    SELECT s.calculation_cost_basis
    FROM catalog.pricing_settings s
    WHERE s.org_id = catalog.current_org_id()
  ),
  ctx AS (
    SELECT
      e.ordinal,
      (e.elem->>'sku_id')::uuid AS sku_id,
      (e.elem->>'location_id')::uuid AS location_id,
      e.elem->>'currency' AS currency,
      e.elem->>'unit' AS unit
    FROM jsonb_array_elements(p_contexts) WITH ORDINALITY AS e(elem, ordinal)
  )
  SELECT
    ctx.ordinal,
    ctx.sku_id,
    ctx.location_id,
    ctx.currency,
    CASE WHEN cr.unit IS NOT DISTINCT FROM COALESCE(ctx.unit, cr.unit) THEN cr.id END,
    cr.cost_type,
    CASE WHEN cr.unit IS NOT DISTINCT FROM COALESCE(ctx.unit, cr.unit) THEN cr.amount_minor END,
    cr.unit,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM settings) THEN 'COST_BASIS_REQUIRES_SELECTION'
      WHEN cr.id IS NOT NULL AND ctx.unit IS NOT NULL AND cr.unit <> ctx.unit THEN 'COST_UNIT_INCOMPATIBLE'
      WHEN cr.id IS NOT NULL THEN NULL
      WHEN EXISTS (
        SELECT 1
        FROM catalog.cost_record o, settings s
        WHERE o.sku_id = ctx.sku_id
          AND (o.location_id = ctx.location_id OR o.location_id IS NULL)
          AND o.cost_type = s.calculation_cost_basis
          AND o.currency <> ctx.currency
          AND o.superseded_at IS NULL
          AND o.effective_period @> p_at
      ) THEN 'COST_CURRENCY_INCOMPATIBLE'
      ELSE 'NO_APPLICABLE_COST_RECORD'
    END
  FROM ctx
  LEFT JOIN LATERAL (
    SELECT c.*
    FROM catalog.cost_record c, settings s
    WHERE c.sku_id = ctx.sku_id
      AND (c.location_id = ctx.location_id OR c.location_id IS NULL)
      AND c.cost_type = s.calculation_cost_basis
      AND c.currency = ctx.currency
      AND c.superseded_at IS NULL
      AND c.effective_period @> p_at
    ORDER BY (c.location_id IS NULL), c.effective_at DESC
    LIMIT 1
  ) cr ON true
  ORDER BY ctx.ordinal;
$$;

GRANT SELECT, INSERT, UPDATE ON catalog.pricing_settings TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.configure_pricing_settings(boolean, integer, text, text, text) TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.resolve_current_prices(jsonb, timestamptz) TO catalog_svc;
GRANT EXECUTE ON FUNCTION catalog.resolve_applicable_costs(jsonb, timestamptz) TO catalog_svc;
