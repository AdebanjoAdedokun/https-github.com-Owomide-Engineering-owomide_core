DROP FUNCTION IF EXISTS proposal.mark_rollout_failed(uuid);
DROP FUNCTION IF EXISTS proposal.claim_due_rollouts(integer);
DROP INDEX IF EXISTS proposal.scheduled_rollout_proposal_pending_uniq;
