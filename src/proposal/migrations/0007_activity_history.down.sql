-- Rollback: 0007_activity_history
-- Service: proposal
DROP INDEX IF EXISTS proposal.implementation_line_request_idx;
DROP FUNCTION IF EXISTS proposal.activity_kind_order(text);
DROP VIEW IF EXISTS proposal.activity;
