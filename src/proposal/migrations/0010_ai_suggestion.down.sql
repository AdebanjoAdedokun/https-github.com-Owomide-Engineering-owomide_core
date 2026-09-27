-- Rollback: 0010_ai_suggestion
-- Service: proposal
DROP TABLE IF EXISTS proposal.ai_suggestion;
DROP FUNCTION IF EXISTS proposal.guard_ai_suggestion();
