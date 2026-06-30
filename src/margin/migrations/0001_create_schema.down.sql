-- Rollback: 0001_create_schema
-- Service: margin
-- ⚠️  DESTRUCTIVE: drops the entire margin schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys all margin rules — requires manual intervention.
DROP SCHEMA IF EXISTS margin CASCADE;
