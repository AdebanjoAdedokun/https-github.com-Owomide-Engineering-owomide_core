-- Rollback: 0004_harden_privileges
-- Service: proposal
COMMENT ON TABLE proposal.proposal_comment IS NULL;
COMMENT ON TABLE proposal.proposal_transition IS NULL;
COMMENT ON TABLE proposal.proposal_line IS NULL;
GRANT DELETE ON proposal.proposal, proposal.change_set, proposal.change_set_line,
  proposal.override_request, proposal.scheduled_rollout TO proposal_svc;
