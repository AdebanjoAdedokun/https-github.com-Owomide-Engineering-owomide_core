-- Rollback: 0001_create_schema
-- Service: data_pipeline
-- ⚠️  DESTRUCTIVE: drops the entire data_pipeline schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys all import batches and mapping templates — requires manual intervention.
DROP SCHEMA IF EXISTS data_pipeline CASCADE;
