-- Migration: 0004_column_profile_ordinal_position
-- Service: data_pipeline

ALTER TABLE data_pipeline.column_profile
    ADD COLUMN ordinal_position integer;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY org_id, batch_id
            ORDER BY column_name, id
        ) AS ordinal_position
    FROM data_pipeline.column_profile
)
UPDATE data_pipeline.column_profile AS profile
SET ordinal_position = ranked.ordinal_position
FROM ranked
WHERE profile.id = ranked.id;

ALTER TABLE data_pipeline.column_profile
    ALTER COLUMN ordinal_position SET NOT NULL,
    ADD CONSTRAINT column_profile_ordinal_position_check CHECK (ordinal_position > 0),
    ADD CONSTRAINT column_profile_unique_ordinal
        UNIQUE (org_id, batch_id, ordinal_position);

-- F2.2 completed parsing before profiles were implemented. Requeue any such batches so the
-- restart-safe worker can rebuild both raw rows and profiles from the retained source object.
UPDATE data_pipeline.import_operation AS operation
SET status = 'queued',
    attempt_count = 0,
    progress_current = 0,
    progress_total = 0,
    next_attempt_at = clock_timestamp(),
    started_at = NULL,
    finished_at = NULL,
    error_message = NULL,
    updated_at = clock_timestamp()
FROM data_pipeline.import_batch AS batch
WHERE operation.org_id = batch.org_id
  AND operation.batch_id = batch.id
  AND operation.operation_type = 'parse_profile'
  AND operation.status = 'succeeded'
  AND batch.status = 'parsing'
  AND NOT EXISTS (
      SELECT 1
      FROM data_pipeline.column_profile AS profile
      WHERE profile.org_id = batch.org_id
        AND profile.batch_id = batch.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM data_pipeline.import_operation AS active_operation
      WHERE active_operation.org_id = operation.org_id
        AND active_operation.batch_id = operation.batch_id
        AND active_operation.operation_type = operation.operation_type
        AND active_operation.status IN ('queued', 'running')
        AND active_operation.id <> operation.id
  );

UPDATE data_pipeline.import_batch AS batch
SET status = 'profiled', updated_at = clock_timestamp()
WHERE batch.status = 'parsing'
  AND EXISTS (
      SELECT 1
      FROM data_pipeline.column_profile AS profile
      WHERE profile.org_id = batch.org_id
        AND profile.batch_id = batch.id
  );
