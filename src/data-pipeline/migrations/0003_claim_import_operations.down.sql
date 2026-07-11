-- Rollback: 0003_claim_import_operations
-- Service: data_pipeline

DROP FUNCTION IF EXISTS data_pipeline.claim_parse_operation(text, integer);
