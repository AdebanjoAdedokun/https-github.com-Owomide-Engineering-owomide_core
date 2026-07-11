-- Migration: 0002_data_pipeline_foundation
-- Service: data_pipeline
-- The migration runner creates the schema and service role before this runs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE data_pipeline.mapping_template (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    source_system text,
    channel_id text,
    customer_segment_id text,
    mappings jsonb NOT NULL CHECK (jsonb_typeof(mappings) = 'object'),
    transformation_rules jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(transformation_rules) = 'array'),
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mapping_template_org_id_key UNIQUE (org_id, id),
    CONSTRAINT mapping_template_unique_name UNIQUE NULLS NOT DISTINCT (
        org_id,
        name,
        source_system,
        channel_id,
        customer_segment_id
    )
);

CREATE TABLE data_pipeline.import_batch (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    owner_id text NOT NULL CHECK (btrim(owner_id) <> ''),
    source_file_url text NOT NULL CHECK (btrim(source_file_url) <> ''),
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_type text NOT NULL CHECK (source_type IN ('csv', 'xlsx')),
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    status text NOT NULL DEFAULT 'uploaded' CHECK (
        status IN (
            'uploaded',
            'parsing',
            'profiled',
            'mapped',
            'validated',
            'committing',
            'committed',
            'failed',
            'discarded'
        )
    ),
    source_system text,
    channel_id text,
    customer_segment_id text,
    template_id uuid,
    failed_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    committed_at timestamptz,
    CONSTRAINT import_batch_org_id_key UNIQUE (org_id, id),
    CONSTRAINT import_batch_template_fk FOREIGN KEY (org_id, template_id)
        REFERENCES data_pipeline.mapping_template (org_id, id)
);

CREATE TABLE data_pipeline.import_row (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    batch_id uuid NOT NULL,
    row_number integer NOT NULL CHECK (row_number > 0),
    raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
    mapped_data jsonb CHECK (mapped_data IS NULL OR jsonb_typeof(mapped_data) = 'object'),
    row_status text NOT NULL DEFAULT 'pending' CHECK (
        row_status IN ('pending', 'mapped', 'validated', 'committed', 'excluded', 'errored')
    ),
    excluded_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT import_row_org_id_key UNIQUE (org_id, id),
    CONSTRAINT import_row_org_batch_id_key UNIQUE (org_id, batch_id, id),
    CONSTRAINT import_row_unique_row_number UNIQUE (org_id, batch_id, row_number),
    CONSTRAINT import_row_batch_fk FOREIGN KEY (org_id, batch_id)
        REFERENCES data_pipeline.import_batch (org_id, id) ON DELETE CASCADE,
    CONSTRAINT import_row_exclusion_check CHECK (
        (row_status = 'excluded' AND NULLIF(btrim(excluded_reason), '') IS NOT NULL)
        OR (row_status <> 'excluded' AND excluded_reason IS NULL)
    )
);

CREATE TABLE data_pipeline.validation_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    batch_id uuid NOT NULL,
    row_id uuid,
    severity text NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
    code text NOT NULL CHECK (btrim(code) <> ''),
    message text NOT NULL CHECK (btrim(message) <> ''),
    field text,
    raw_value text,
    suggested_fix text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT validation_event_org_id_key UNIQUE (org_id, id),
    CONSTRAINT validation_event_batch_fk FOREIGN KEY (org_id, batch_id)
        REFERENCES data_pipeline.import_batch (org_id, id) ON DELETE CASCADE,
    CONSTRAINT validation_event_row_fk FOREIGN KEY (org_id, batch_id, row_id)
        REFERENCES data_pipeline.import_row (org_id, batch_id, id) ON DELETE CASCADE
);

CREATE TABLE data_pipeline.column_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    batch_id uuid NOT NULL,
    column_name text NOT NULL CHECK (btrim(column_name) <> ''),
    detected_type text NOT NULL CHECK (btrim(detected_type) <> ''),
    sample_values jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(sample_values) = 'array'),
    currency_hint text,
    date_hint text,
    suggested_mapping text,
    confidence numeric(5, 4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT column_profile_org_id_key UNIQUE (org_id, id),
    CONSTRAINT column_profile_unique_column UNIQUE (org_id, batch_id, column_name),
    CONSTRAINT column_profile_batch_fk FOREIGN KEY (org_id, batch_id)
        REFERENCES data_pipeline.import_batch (org_id, id) ON DELETE CASCADE
);

CREATE TABLE data_pipeline.import_operation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    batch_id uuid NOT NULL,
    operation_type text NOT NULL CHECK (
        operation_type IN ('parse_profile', 'apply_mapping', 'validate', 'commit')
    ),
    status text NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
    ),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    progress_current integer NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
    progress_total integer NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
    error_message text,
    locked_by text,
    locked_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    CONSTRAINT import_operation_org_id_key UNIQUE (org_id, id),
    CONSTRAINT import_operation_batch_fk FOREIGN KEY (org_id, batch_id)
        REFERENCES data_pipeline.import_batch (org_id, id) ON DELETE CASCADE,
    CONSTRAINT import_operation_progress_check CHECK (progress_current <= progress_total),
    CONSTRAINT import_operation_lock_check CHECK (
        (status = 'running' AND locked_by IS NOT NULL AND locked_at IS NOT NULL)
        OR (status <> 'running' AND locked_by IS NULL AND locked_at IS NULL)
    )
);

CREATE FUNCTION data_pipeline.protect_import_batch_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'import batches are forensic records and cannot be deleted';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
        OR NEW.source_file_url IS DISTINCT FROM OLD.source_file_url
        OR NEW.source_filename IS DISTINCT FROM OLD.source_filename
        OR NEW.source_type IS DISTINCT FROM OLD.source_type
        OR NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'import source metadata is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER import_batch_source_immutable
BEFORE UPDATE OR DELETE ON data_pipeline.import_batch
FOR EACH ROW EXECUTE FUNCTION data_pipeline.protect_import_batch_source();

CREATE FUNCTION data_pipeline.protect_import_row_raw_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'raw import rows are forensic records and cannot be deleted';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
        OR NEW.row_number IS DISTINCT FROM OLD.row_number
        OR NEW.raw_data IS DISTINCT FROM OLD.raw_data
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'raw import row identity and data are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER import_row_raw_data_immutable
BEFORE UPDATE OR DELETE ON data_pipeline.import_row
FOR EACH ROW EXECUTE FUNCTION data_pipeline.protect_import_row_raw_data();

CREATE INDEX import_batch_org_status_idx
    ON data_pipeline.import_batch (org_id, status, created_at DESC);
CREATE INDEX import_batch_org_created_idx
    ON data_pipeline.import_batch (org_id, created_at DESC);
CREATE INDEX import_row_org_batch_status_idx
    ON data_pipeline.import_row (org_id, batch_id, row_status);
CREATE INDEX import_row_org_batch_row_number_idx
    ON data_pipeline.import_row (org_id, batch_id, row_number);
CREATE INDEX mapping_template_org_lookup_idx
    ON data_pipeline.mapping_template (
        org_id,
        source_system,
        channel_id,
        customer_segment_id,
        updated_at DESC
    );
CREATE INDEX validation_event_org_batch_severity_idx
    ON data_pipeline.validation_event (org_id, batch_id, severity, created_at DESC);
CREATE INDEX validation_event_org_row_idx
    ON data_pipeline.validation_event (org_id, row_id);
CREATE INDEX column_profile_org_batch_idx
    ON data_pipeline.column_profile (org_id, batch_id);
CREATE INDEX import_operation_org_batch_idx
    ON data_pipeline.import_operation (org_id, batch_id, created_at DESC);
CREATE INDEX import_operation_queue_idx
    ON data_pipeline.import_operation (status, next_attempt_at, created_at)
    WHERE status = 'queued';
CREATE UNIQUE INDEX import_operation_one_active_idx
    ON data_pipeline.import_operation (org_id, batch_id, operation_type)
    WHERE status IN ('queued', 'running');

ALTER TABLE data_pipeline.mapping_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.mapping_template FORCE ROW LEVEL SECURITY;
CREATE POLICY mapping_template_tenant_policy ON data_pipeline.mapping_template
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.import_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY import_batch_tenant_policy ON data_pipeline.import_batch
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.import_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.import_row FORCE ROW LEVEL SECURITY;
CREATE POLICY import_row_tenant_policy ON data_pipeline.import_row
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.validation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.validation_event FORCE ROW LEVEL SECURITY;
CREATE POLICY validation_event_tenant_policy ON data_pipeline.validation_event
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.column_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.column_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY column_profile_tenant_policy ON data_pipeline.column_profile
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.import_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.import_operation FORCE ROW LEVEL SECURITY;
CREATE POLICY import_operation_tenant_policy ON data_pipeline.import_operation
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));
