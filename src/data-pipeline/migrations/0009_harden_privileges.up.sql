-- Migration: 0009_harden_privileges
-- Service: data-pipeline
--
-- The migration runner grants data_pipeline_svc SELECT, INSERT, UPDATE and DELETE on every new
-- table by default. The service deletes only its own rebuildable findings (validation_event) and
-- profiles (column_profile); raw rows, batches, operations, commit items and templates are never
-- deleted (locked rule 1: originals are retained). Deletion is revoked everywhere else, and the
-- two tables that need it are tagged, so the invariant check (migrate check) can tell them apart.

REVOKE DELETE ON ALL TABLES IN SCHEMA data_pipeline FROM data_pipeline_svc;
GRANT DELETE ON data_pipeline.validation_event, data_pipeline.column_profile TO data_pipeline_svc;

COMMENT ON TABLE data_pipeline.validation_event IS
  'Row and batch findings; rebuilt on every validation attempt. @deletable';
COMMENT ON TABLE data_pipeline.column_profile IS
  'Column profile of a batch; replaced when the batch is profiled again. @deletable';
COMMENT ON TABLE data_pipeline.fx_rate_snapshot IS 'Immutable FX snapshot. @append-only';
COMMENT ON TABLE data_pipeline.fx_rate_entry IS 'Immutable FX snapshot entry. @append-only';
