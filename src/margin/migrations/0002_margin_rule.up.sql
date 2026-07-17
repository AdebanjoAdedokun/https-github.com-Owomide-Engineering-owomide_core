-- Migration: 0002_margin_rule
-- Service: margin
-- Creates the margin_rule and margin_rule_application tables with RLS.

-- RLS helper: mirrors proposal.current_org_id()
CREATE FUNCTION margin.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '');
$$;

CREATE FUNCTION margin.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE margin.margin_rule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  channel_id      UUID,
  category_id     UUID,
  sku_id          UUID,
  floor_type      TEXT NOT NULL CHECK (floor_type IN ('pct_margin', 'pct_markup', 'absolute_minimum')),
  floor_value     BIGINT NOT NULL,
  currency        TEXT NOT NULL,
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  effective_until TIMESTAMPTZ,
  created_by      UUID NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER margin_rule_updated_at
  BEFORE UPDATE ON margin.margin_rule
  FOR EACH ROW EXECUTE FUNCTION margin.set_updated_at();

CREATE TABLE margin.margin_rule_application (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL,
  rule_id          UUID NOT NULL REFERENCES margin.margin_rule(id),
  proposal_id      UUID NOT NULL,
  proposal_line_id UUID NOT NULL,
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  meta             JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX ON margin.margin_rule (org_id, is_active);
CREATE INDEX ON margin.margin_rule (org_id, sku_id) WHERE sku_id IS NOT NULL;
CREATE INDEX ON margin.margin_rule (org_id, channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX ON margin.margin_rule (org_id, category_id) WHERE category_id IS NOT NULL;
CREATE INDEX ON margin.margin_rule_application (org_id, proposal_id);

ALTER TABLE margin.margin_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY margin_rule_org_isolation ON margin.margin_rule
  USING (org_id::text = margin.current_org_id())
  WITH CHECK (org_id::text = margin.current_org_id());

ALTER TABLE margin.margin_rule_application ENABLE ROW LEVEL SECURITY;
CREATE POLICY margin_rule_application_org_isolation ON margin.margin_rule_application
  USING (org_id::text = margin.current_org_id());

GRANT SELECT, INSERT, UPDATE ON margin.margin_rule TO margin_svc;
GRANT SELECT, INSERT ON margin.margin_rule_application TO margin_svc;
