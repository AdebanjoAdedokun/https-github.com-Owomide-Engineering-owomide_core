-- Rollback: 0009_harden_privileges
-- Service: data-pipeline
COMMENT ON TABLE data_pipeline.fx_rate_entry IS NULL;
COMMENT ON TABLE data_pipeline.fx_rate_snapshot IS NULL;
COMMENT ON TABLE data_pipeline.column_profile IS NULL;
COMMENT ON TABLE data_pipeline.validation_event IS NULL;
GRANT DELETE ON data_pipeline.import_batch, data_pipeline.import_row, data_pipeline.mapping_template,
  data_pipeline.import_operation, data_pipeline.commit_item TO data_pipeline_svc;
