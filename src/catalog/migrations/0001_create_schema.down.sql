-- Rollback: 0001_create_schema
-- Service: catalog
-- ⚠️  DESTRUCTIVE: drops the entire catalog schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys all customer pricing data — requires manual intervention.
DROP SCHEMA IF EXISTS catalog CASCADE;
