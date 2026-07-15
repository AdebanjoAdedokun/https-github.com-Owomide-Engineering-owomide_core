-- Rollback: 0002_proposal_foundation
-- Service: proposal
-- ⚠️  DESTRUCTIVE: drops the entire proposal schema and all its contents (CASCADE).
-- Safe in local dev. In staging/prod this destroys all proposal and change-set data — requires manual intervention.
DROP SCHEMA IF EXISTS proposal CASCADE;
