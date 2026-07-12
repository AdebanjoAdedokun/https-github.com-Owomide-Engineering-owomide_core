-- Migration: 0007_canonical_commit_outbox
-- Service: data_pipeline

ALTER TABLE data_pipeline.import_operation
    ADD COLUMN result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD CONSTRAINT import_operation_result_payload_check
        CHECK (jsonb_typeof(result_payload) = 'object'),
    ADD CONSTRAINT import_operation_org_id_batch_id_key
        UNIQUE (org_id, id, batch_id);

CREATE TABLE data_pipeline.commit_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL CHECK (btrim(org_id) <> ''),
    operation_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    row_id uuid NOT NULL,
    ordinal_position integer NOT NULL CHECK (ordinal_position >= 0),
    catalog_status text NOT NULL DEFAULT 'pending' CHECK (
        catalog_status IN ('pending', 'created', 'updated', 'unchanged', 'rejected')
    ),
    catalog_operation_id text,
    catalog_replayed boolean NOT NULL DEFAULT false,
    catalog_errors jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(catalog_errors) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commit_item_org_id_key UNIQUE (org_id, id),
    CONSTRAINT commit_item_operation_ordinal_key UNIQUE (org_id, operation_id, ordinal_position),
    CONSTRAINT commit_item_operation_row_key UNIQUE (org_id, operation_id, row_id),
    CONSTRAINT commit_item_operation_fk FOREIGN KEY (org_id, operation_id, batch_id)
        REFERENCES data_pipeline.import_operation (org_id, id, batch_id) ON DELETE CASCADE,
    CONSTRAINT commit_item_row_fk FOREIGN KEY (org_id, batch_id, row_id)
        REFERENCES data_pipeline.import_row (org_id, batch_id, id)
);

CREATE INDEX commit_item_org_operation_ordinal_idx
    ON data_pipeline.commit_item (org_id, operation_id, ordinal_position);

CREATE TABLE data_pipeline.outbox_event (
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
    CONSTRAINT outbox_event_org_id_key UNIQUE (org_id, id),
    CONSTRAINT outbox_event_aggregate_key UNIQUE (org_id, event_type, aggregate_id)
);

CREATE INDEX outbox_event_pending_idx
    ON data_pipeline.outbox_event (available_at, occurred_at, id)
    WHERE published_at IS NULL;

ALTER TABLE data_pipeline.commit_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.commit_item FORCE ROW LEVEL SECURITY;
CREATE POLICY commit_item_tenant_policy ON data_pipeline.commit_item
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

ALTER TABLE data_pipeline.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_pipeline.outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_event_tenant_policy ON data_pipeline.outbox_event
    USING (org_id = NULLIF(current_setting('app.org_id', true), ''))
    WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), ''));

CREATE FUNCTION data_pipeline.claim_outbox_events(
    p_limit integer,
    p_lease_seconds integer DEFAULT 30
)
RETURNS SETOF data_pipeline.outbox_event
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    WITH claimed AS (
        SELECT id
        FROM data_pipeline.outbox_event
        WHERE published_at IS NULL
          AND available_at <= clock_timestamp()
          AND p_limit BETWEEN 1 AND 500
          AND p_lease_seconds BETWEEN 1 AND 3600
        ORDER BY occurred_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE data_pipeline.outbox_event AS event
    SET attempts = event.attempts + 1,
        available_at = clock_timestamp() + (p_lease_seconds * interval '1 second')
    FROM claimed
    WHERE event.id = claimed.id
    RETURNING event.*;
$$;

CREATE FUNCTION data_pipeline.mark_outbox_published(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    UPDATE data_pipeline.outbox_event
    SET published_at = clock_timestamp(), last_error = NULL
    WHERE id = p_id AND published_at IS NULL;
$$;

CREATE FUNCTION data_pipeline.mark_outbox_failed(
    p_id uuid,
    p_error text,
    p_retry_seconds integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    UPDATE data_pipeline.outbox_event
    SET last_error = left(p_error, 2000),
        available_at = clock_timestamp()
            + (GREATEST(1, LEAST(p_retry_seconds, 3600)) * interval '1 second')
    WHERE id = p_id AND published_at IS NULL;
$$;

REVOKE ALL ON FUNCTION data_pipeline.claim_outbox_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION data_pipeline.mark_outbox_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION data_pipeline.mark_outbox_failed(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data_pipeline.claim_outbox_events(integer, integer)
    TO data_pipeline_svc;
GRANT EXECUTE ON FUNCTION data_pipeline.mark_outbox_published(uuid)
    TO data_pipeline_svc;
GRANT EXECUTE ON FUNCTION data_pipeline.mark_outbox_failed(uuid, text, integer)
    TO data_pipeline_svc;
REVOKE UPDATE, DELETE ON data_pipeline.outbox_event FROM data_pipeline_svc;

CREATE OR REPLACE FUNCTION data_pipeline.claim_import_operation(
    p_worker_id text,
    p_lease_seconds integer
)
RETURNS TABLE (
    operation_id uuid,
    operation_org_id text,
    batch_id uuid,
    operation_type text,
    attempt_count integer,
    max_attempts integer,
    request_payload jsonb,
    source_file_url text,
    source_filename text,
    source_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    WITH candidate AS MATERIALIZED (
        SELECT operation.id
        FROM data_pipeline.import_operation AS operation
        JOIN data_pipeline.import_batch AS batch
          ON batch.org_id = operation.org_id
         AND batch.id = operation.batch_id
        WHERE operation.operation_type IN ('parse_profile', 'apply_mapping', 'validate', 'commit')
          AND operation.attempt_count < operation.max_attempts
          AND btrim(p_worker_id) <> ''
          AND p_lease_seconds BETWEEN 10 AND 3600
          AND (
              (operation.operation_type = 'parse_profile'
                  AND batch.status IN ('uploaded', 'parsing'))
              OR (operation.operation_type = 'apply_mapping'
                  AND batch.status IN ('profiled', 'mapped'))
              OR (operation.operation_type = 'validate'
                  AND batch.status IN ('mapped', 'validated'))
              OR (operation.operation_type = 'commit'
                  AND batch.status = 'committing')
          )
          AND (
              (operation.status = 'queued'
                  AND operation.next_attempt_at <= clock_timestamp())
              OR (operation.status = 'running'
                  AND operation.locked_at <= (
                      clock_timestamp() - (p_lease_seconds * interval '1 second')
                  ))
          )
        ORDER BY operation.next_attempt_at, operation.created_at, operation.id
        FOR UPDATE OF operation SKIP LOCKED
        LIMIT 1
    ),
    claimed AS (
        UPDATE data_pipeline.import_operation AS operation
        SET status = 'running',
            attempt_count = operation.attempt_count + 1,
            locked_by = p_worker_id,
            locked_at = clock_timestamp(),
            started_at = COALESCE(operation.started_at, clock_timestamp()),
            finished_at = NULL,
            error_message = NULL,
            updated_at = clock_timestamp()
        FROM candidate
        WHERE operation.id = candidate.id
        RETURNING operation.*
    ),
    batch_updated AS (
        UPDATE data_pipeline.import_batch AS batch
        SET status = CASE
                WHEN claimed.operation_type = 'parse_profile' THEN 'parsing'
                WHEN claimed.operation_type = 'commit' THEN 'committing'
                ELSE batch.status
            END,
            failed_reason = NULL,
            updated_at = clock_timestamp()
        FROM claimed
        WHERE batch.org_id = claimed.org_id
          AND batch.id = claimed.batch_id
        RETURNING
            batch.org_id,
            batch.id,
            batch.source_file_url,
            batch.source_filename,
            batch.source_type
    )
    SELECT
        claimed.id,
        claimed.org_id,
        claimed.batch_id,
        claimed.operation_type,
        claimed.attempt_count,
        claimed.max_attempts,
        claimed.request_payload,
        batch_updated.source_file_url,
        batch_updated.source_filename,
        batch_updated.source_type
    FROM claimed
    JOIN batch_updated
      ON batch_updated.org_id = claimed.org_id
     AND batch_updated.id = claimed.batch_id;
$$;

REVOKE ALL ON FUNCTION data_pipeline.claim_import_operation(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data_pipeline.claim_import_operation(text, integer)
    TO data_pipeline_svc;
