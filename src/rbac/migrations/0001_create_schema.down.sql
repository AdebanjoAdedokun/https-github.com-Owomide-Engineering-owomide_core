-- Rollback: 0001_create_schema
-- Service: rbac
-- ⚠️  DESTRUCTIVE: drops the entire rbac schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys every role/permission grant — requires manual intervention.
DROP SCHEMA IF EXISTS rbac CASCADE;
