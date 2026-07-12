-- Rollback: 0005_mapping_operations
-- Service: data_pipeline

DROP FUNCTION IF EXISTS data_pipeline.claim_import_operation(text, integer);
DROP INDEX IF EXISTS data_pipeline.import_operation_one_active_per_batch_idx;
ALTER TABLE data_pipeline.import_operation
    DROP CONSTRAINT IF EXISTS import_operation_request_payload_check,
    DROP COLUMN IF EXISTS request_payload;
