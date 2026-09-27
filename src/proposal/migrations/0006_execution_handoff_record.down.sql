-- Rollback: 0006_execution_handoff_record
-- Service: proposal
-- ⚠️  DESTRUCTIVE: drops export history and implementation records.
-- Safe in local dev. In staging/prod this destroys execution evidence — requires manual intervention.

DROP VIEW IF EXISTS proposal.implementation_line_current;
DROP TABLE IF EXISTS proposal.implementation_line;
DROP TABLE IF EXISTS proposal.export_event;
DROP FUNCTION IF EXISTS proposal.guard_executable_version();
DROP FUNCTION IF EXISTS proposal.assert_version_executable(text, uuid);
