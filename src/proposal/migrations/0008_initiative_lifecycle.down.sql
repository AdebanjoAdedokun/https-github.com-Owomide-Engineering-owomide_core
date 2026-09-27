-- Rollback: 0008_initiative_lifecycle
-- Service: proposal
REVOKE UPDATE (title, objective, priority, owner_user_id, overlap_acknowledged_by)
  ON proposal.initiative FROM proposal_svc;
GRANT UPDATE ON proposal.initiative TO proposal_svc;
DROP TRIGGER IF EXISTS initiative_state_guard ON proposal.initiative;
DROP FUNCTION IF EXISTS proposal.guard_initiative_state();
DROP TRIGGER IF EXISTS initiative_transition_apply ON proposal.initiative_transition;
DROP FUNCTION IF EXISTS proposal.apply_initiative_transition();
DROP FUNCTION IF EXISTS proposal.initiative_reason_required(text, text);
DROP FUNCTION IF EXISTS proposal.initiative_transition_allowed(text, text);
DROP FUNCTION IF EXISTS proposal.initiative_state_order(text);
DROP TABLE IF EXISTS proposal.initiative_lifecycle_rule;
