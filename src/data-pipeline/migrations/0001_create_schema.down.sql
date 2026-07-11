-- Rollback: 0001_create_schema
-- Service: data_pipeline

DROP TABLE IF EXISTS data_pipeline.import_operation;
DROP TABLE IF EXISTS data_pipeline.column_profile;
DROP TABLE IF EXISTS data_pipeline.validation_event;
DROP TABLE IF EXISTS data_pipeline.import_row;
DROP TABLE IF EXISTS data_pipeline.import_batch;
DROP TABLE IF EXISTS data_pipeline.mapping_template;
DROP FUNCTION IF EXISTS data_pipeline.protect_import_row_raw_data();
DROP FUNCTION IF EXISTS data_pipeline.protect_import_batch_source();
