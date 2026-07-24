-- Prevent duplicate pending rollouts for the same proposal
CREATE UNIQUE INDEX scheduled_rollout_proposal_pending_uniq
  ON proposal.scheduled_rollout (proposal_id)
  WHERE status = 'pending';

-- Claim pending rollouts whose effective_at is due; atomically increments attempts.
-- SECURITY DEFINER bypasses RLS so the background worker (no org context) can scan all orgs.
CREATE FUNCTION proposal.claim_due_rollouts(p_limit integer)
RETURNS SETOF proposal.scheduled_rollout
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
  WITH claimed AS (
    SELECT id
    FROM proposal.scheduled_rollout
    WHERE status = 'pending'
      AND effective_at <= clock_timestamp()
    ORDER BY effective_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE proposal.scheduled_rollout AS sr
  SET attempts = sr.attempts + 1,
      last_attempted_at = clock_timestamp()
  FROM claimed
  WHERE sr.id = claimed.id
  RETURNING sr.*;
$$;

-- Permanently fail a rollout after max retries (called without an org transaction).
-- SECURITY DEFINER bypasses RLS — same reasoning as claim_due_rollouts.
CREATE FUNCTION proposal.mark_rollout_failed(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, proposal
AS $$
  UPDATE proposal.scheduled_rollout
  SET status = 'failed', last_attempted_at = clock_timestamp()
  WHERE id = p_id AND status = 'pending';
$$;

REVOKE ALL ON FUNCTION proposal.claim_due_rollouts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION proposal.mark_rollout_failed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION proposal.claim_due_rollouts(integer) TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.mark_rollout_failed(uuid) TO proposal_svc;
