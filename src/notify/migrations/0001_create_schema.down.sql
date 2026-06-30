-- Rollback: 0001_create_schema
-- Service: notify
-- ⚠️  DESTRUCTIVE: drops the entire notify schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys all notification records — requires manual intervention.
DROP SCHEMA IF EXISTS notify CASCADE;
