-- Migration: 0004_harden_privileges
-- Service: proposal
--
-- 0002 granted proposal_svc DELETE on every table and revoked it only for the append-only ones.
-- The service deletes from proposal_line only (replacing a draft's lines); Proposals, change-sets,
-- override requests and scheduled rollouts are retired by state, never removed (DiscardChangeSet,
-- behind proposal.delete_draft, sets status = 'discarded'). Revoke DELETE everywhere else and
-- declare the intent for `make db-check`. A future hard delete (for example the nightly clean-up
-- of old drafts) must GRANT DELETE in its own migration and tag the table @deletable.

REVOKE DELETE ON proposal.proposal, proposal.change_set, proposal.change_set_line,
  proposal.override_request, proposal.scheduled_rollout FROM proposal_svc;

COMMENT ON TABLE proposal.proposal_line IS 'Lines of a draft Proposal; replaced while the Proposal is a draft. @deletable';
COMMENT ON TABLE proposal.proposal_transition IS 'Proposal state transitions. @append-only';
COMMENT ON TABLE proposal.proposal_comment IS 'Comments on a Proposal. @append-only';
