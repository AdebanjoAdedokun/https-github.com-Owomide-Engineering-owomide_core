-- Migration: 0003_claim_import_operations
-- Service: data_pipeline

CREATE FUNCTION data_pipeline.claim_parse_operation(
    p_worker_id text,
    p_lease_seconds integer
)
RETURNS TABLE (
    operation_id uuid,
    operation_org_id text,
    batch_id uuid,
    attempt_count integer,
    max_attempts integer,
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
        WHERE operation.operation_type = 'parse_profile'
          AND operation.attempt_count < operation.max_attempts
          AND btrim(p_worker_id) <> ''
          AND p_lease_seconds BETWEEN 10 AND 3600
          AND (
              (
                  operation.status = 'queued'
                  AND operation.next_attempt_at <= clock_timestamp()
              )
              OR (
                  operation.status = 'running'
                  AND operation.locked_at <= (
                      clock_timestamp() - (p_lease_seconds * interval '1 second')
                  )
              )
          )
        ORDER BY operation.next_attempt_at, operation.created_at, operation.id
        FOR UPDATE SKIP LOCKED
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
        SET status = 'parsing',
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
        claimed.attempt_count,
        claimed.max_attempts,
        batch_updated.source_file_url,
        batch_updated.source_filename,
        batch_updated.source_type
    FROM claimed
    JOIN batch_updated
      ON batch_updated.org_id = claimed.org_id
     AND batch_updated.id = claimed.batch_id;
$$;

REVOKE ALL ON FUNCTION data_pipeline.claim_parse_operation(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data_pipeline.claim_parse_operation(text, integer)
    TO data_pipeline_svc;
