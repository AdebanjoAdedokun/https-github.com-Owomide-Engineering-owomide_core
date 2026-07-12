-- Migration: 0006_validation_operations
-- Service: data_pipeline

CREATE INDEX validation_event_org_batch_created_idx
    ON data_pipeline.validation_event (org_id, batch_id, created_at DESC, id DESC);

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
        WHERE operation.operation_type IN ('parse_profile', 'apply_mapping', 'validate')
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
