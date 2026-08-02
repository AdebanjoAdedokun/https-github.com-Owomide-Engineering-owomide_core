-- Migration: 0008_fx_rate_snapshots
-- Service: data_pipeline

CREATE TABLE data_pipeline.fx_rate_snapshot (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
    source text NOT NULL CHECK (btrim(source) <> ''),
    base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    effective_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    provider_ref text,
    checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    CONSTRAINT fx_rate_snapshot_org_id_key UNIQUE (org_id, id),
    CONSTRAINT fx_rate_snapshot_idempotency_key UNIQUE (org_id, idempotency_key)
);

CREATE TABLE data_pipeline.fx_rate_entry (
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    snapshot_id uuid NOT NULL,
    quote_currency text NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
    rate numeric(38, 18) NOT NULL CHECK (rate > 0),
    PRIMARY KEY (org_id, snapshot_id, quote_currency),
    CONSTRAINT fx_rate_entry_snapshot_fk FOREIGN KEY (org_id, snapshot_id)
        REFERENCES data_pipeline.fx_rate_snapshot (org_id, id)
);

CREATE INDEX fx_rate_snapshot_lookup_idx
    ON data_pipeline.fx_rate_snapshot (
        org_id,
        source,
        effective_at DESC,
        recorded_at DESC,
        id DESC
    );

ALTER TABLE data_pipeline.fx_rate_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.fx_rate_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY fx_rate_snapshot_tenant_policy ON data_pipeline.fx_rate_snapshot
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.fx_rate_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.fx_rate_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY fx_rate_entry_tenant_policy ON data_pipeline.fx_rate_entry
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

CREATE FUNCTION data_pipeline.protect_fx_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'FX rate history is immutable';
END;
$$;

CREATE TRIGGER fx_rate_snapshot_immutable
BEFORE UPDATE OR DELETE ON data_pipeline.fx_rate_snapshot
FOR EACH ROW EXECUTE FUNCTION data_pipeline.protect_fx_rate_history();

CREATE TRIGGER fx_rate_entry_immutable
BEFORE UPDATE OR DELETE ON data_pipeline.fx_rate_entry
FOR EACH ROW EXECUTE FUNCTION data_pipeline.protect_fx_rate_history();

GRANT SELECT, INSERT ON data_pipeline.fx_rate_snapshot TO data_pipeline_svc;
GRANT SELECT, INSERT ON data_pipeline.fx_rate_entry TO data_pipeline_svc;
REVOKE UPDATE, DELETE ON data_pipeline.fx_rate_snapshot FROM data_pipeline_svc;
REVOKE UPDATE, DELETE ON data_pipeline.fx_rate_entry FROM data_pipeline_svc;
