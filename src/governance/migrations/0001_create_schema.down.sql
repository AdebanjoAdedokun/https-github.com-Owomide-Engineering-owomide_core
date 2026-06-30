-- Rollback: 0001_create_schema
-- Service: governance
-- ⚠️  DESTRUCTIVE: drops the entire governance schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys the append-only audit log — requires manual intervention.
DROP SCHEMA IF EXISTS governance CASCADE;
