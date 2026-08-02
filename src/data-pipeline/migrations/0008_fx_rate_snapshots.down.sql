-- Migration: 0008_fx_rate_snapshots
-- Service: data_pipeline

DROP TRIGGER IF EXISTS fx_rate_entry_immutable ON data_pipeline.fx_rate_entry;
DROP TRIGGER IF EXISTS fx_rate_snapshot_immutable ON data_pipeline.fx_rate_snapshot;
DROP FUNCTION IF EXISTS data_pipeline.protect_fx_rate_history();
DROP TABLE IF EXISTS data_pipeline.fx_rate_entry;
DROP TABLE IF EXISTS data_pipeline.fx_rate_snapshot;
