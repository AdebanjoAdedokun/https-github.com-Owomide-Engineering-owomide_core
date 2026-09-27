-- Rollback: 0005_initiative_versions_decisions
-- Service: proposal
-- ⚠️  DESTRUCTIVE: drops Initiatives, Proposal versions and decisions and all their data.
-- Safe in local dev. In staging/prod this destroys decision history — requires manual intervention.

DROP TABLE IF EXISTS proposal.decision;
DROP FUNCTION IF EXISTS proposal.apply_decision_status();
DROP FUNCTION IF EXISTS proposal.enforce_decision_rules();
DROP TABLE IF EXISTS proposal.proposal_version_line;
DROP FUNCTION IF EXISTS proposal.guard_draft_line_change();
DROP TABLE IF EXISTS proposal.proposal_version;
DROP FUNCTION IF EXISTS proposal.guard_proposal_version_insert();
DROP FUNCTION IF EXISTS proposal.guard_proposal_version_update();
DROP INDEX IF EXISTS proposal.proposal_org_initiative_idx;
ALTER TABLE proposal.proposal DROP CONSTRAINT IF EXISTS proposal_initiative_fk;
ALTER TABLE proposal.proposal DROP COLUMN IF EXISTS initiative_id;
DROP TABLE IF EXISTS proposal.initiative_transition;
DROP TABLE IF EXISTS proposal.initiative_assumption;
DROP TABLE IF EXISTS proposal.initiative_scope_member;
DROP FUNCTION IF EXISTS proposal.guard_scope_member_update();
DROP TABLE IF EXISTS proposal.initiative;
