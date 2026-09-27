-- Migration: 0007_activity_history
-- Service: proposal
-- PostgreSQL 16+
--
-- One read-only timeline of what happened to an Initiative and its Proposals, and who did it:
-- creation, state changes, scope removals, assumptions, versions, submissions, decisions,
-- hand-off exports and implementation records (PRD history and audit requirements; decisions
-- D-05, D-06). It is derived from the append-only records, so it cannot drift from them.
--
-- security_invoker: the caller's row-level security applies, so a tenant sees only its own rows.
-- `detail` carries identifiers, counts and reasons, never prices, costs or margins.
-- Implementation records are summarised per recording request (one entry per submission of
-- results by an Executor), not one entry per line.

CREATE VIEW proposal.activity
WITH (security_invoker = true)
AS
SELECT i.org_id, i.id AS initiative_id, NULL::uuid AS proposal_id, NULL::uuid AS proposal_version_id,
       NULL::integer AS version_number, i.created_at AS occurred_at, i.created_by AS actor_id,
       'initiative_created'::text AS kind,
       jsonb_build_object('type', i.type, 'title', i.title, 'created_from', i.created_from) AS detail,
       'initiative'::text AS source_table, i.id AS source_id
FROM proposal.initiative i

UNION ALL
-- The creation entry above already covers the initial state.
SELECT t.org_id, t.initiative_id, NULL, NULL, NULL, t.occurred_at, t.actor_id,
       'initiative_state_changed',
       jsonb_build_object('from', t.from_state, 'to', t.to_state, 'reason', t.reason),
       'initiative_transition', t.id
FROM proposal.initiative_transition t
WHERE t.from_state IS NOT NULL

UNION ALL
SELECT m.org_id, m.initiative_id, NULL, NULL, NULL, m.removed_at, m.removed_by,
       'scope_member_removed',
       jsonb_build_object('sku_id', m.sku_id, 'channel_id', m.channel_id,
                          'location_id', m.location_id, 'reason', m.removal_reason),
       'initiative_scope_member', m.id
FROM proposal.initiative_scope_member m
WHERE m.removed_at IS NOT NULL

UNION ALL
SELECT a.org_id, a.initiative_id, NULL, NULL, NULL, a.created_at, a.author_id,
       'assumption_added', jsonb_build_object('statement', a.statement),
       'initiative_assumption', a.id
FROM proposal.initiative_assumption a

UNION ALL
SELECT v.org_id, p.initiative_id, v.proposal_id, v.id, v.version_number, v.created_at,
       v.created_by, 'version_created',
       jsonb_build_object('previous_version_id', v.previous_version_id),
       'proposal_version', v.id
FROM proposal.proposal_version v
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id

UNION ALL
SELECT v.org_id, p.initiative_id, v.proposal_id, v.id, v.version_number, v.submitted_at,
       v.submitted_by, 'version_submitted',
       jsonb_build_object('snapshot_hash', v.snapshot_hash),
       'proposal_version', v.id
FROM proposal.proposal_version v
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id
WHERE v.submitted_at IS NOT NULL

UNION ALL
SELECT d.org_id, p.initiative_id, v.proposal_id, v.id, v.version_number, d.decided_at,
       d.decided_by, 'decision_' || d.outcome,
       jsonb_build_object('reason', d.reason),
       'decision', d.id
FROM proposal.decision d
JOIN proposal.proposal_version v ON v.org_id = d.org_id AND v.id = d.proposal_version_id
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id

UNION ALL
SELECT e.org_id, p.initiative_id, v.proposal_id, v.id, v.version_number, e.exported_at,
       e.exported_by, 'exported',
       jsonb_build_object('kind', e.kind, 'line_count', e.line_count, 'file_sha256', e.file_sha256),
       'export_event', e.id
FROM proposal.export_event e
JOIN proposal.proposal_version v ON v.org_id = e.org_id AND v.id = e.proposal_version_id
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id

UNION ALL
SELECT r.org_id, p.initiative_id, v.proposal_id, v.id, v.version_number, r.occurred_at,
       r.recorded_by, 'implementation_recorded',
       jsonb_build_object('request_id', r.request_id, 'implemented', r.implemented,
                          'implemented_different', r.implemented_different, 'failed', r.failed),
       'implementation_line', r.first_line_id
FROM (
  SELECT l.org_id, l.proposal_version_id, l.request_id, l.recorded_by,
         min(l.recorded_at) AS occurred_at,
         (array_agg(l.id ORDER BY l.recorded_at, l.id))[1] AS first_line_id,
         count(*) FILTER (WHERE l.outcome = 'implemented')::integer AS implemented,
         count(*) FILTER (WHERE l.outcome = 'implemented_different')::integer AS implemented_different,
         count(*) FILTER (WHERE l.outcome = 'failed')::integer AS failed
  FROM proposal.implementation_line l
  GROUP BY l.org_id, l.proposal_version_id, l.request_id, l.recorded_by
) r
JOIN proposal.proposal_version v ON v.org_id = r.org_id AND v.id = r.proposal_version_id
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id;

COMMENT ON VIEW proposal.activity IS
  'Read-only Initiative and Proposal history. Order by (occurred_at, kind_order, source_id) for a stable timeline.';

-- Stable ordering when two entries share a timestamp (e.g. a submission and its version creation
-- in one transaction): lifecycle order, then the source row id.
CREATE FUNCTION proposal.activity_kind_order(p_kind text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'initiative_created' THEN 10
    WHEN 'assumption_added' THEN 20
    WHEN 'initiative_state_changed' THEN 30
    WHEN 'version_created' THEN 40
    WHEN 'scope_member_removed' THEN 50
    WHEN 'version_submitted' THEN 60
    WHEN 'decision_changes_requested' THEN 70
    WHEN 'decision_rejected' THEN 70
    WHEN 'decision_approved' THEN 70
    WHEN 'exported' THEN 80
    WHEN 'implementation_recorded' THEN 90
    ELSE 100
  END;
$$;

-- Helpful for the per-request summary above.
CREATE INDEX implementation_line_request_idx
  ON proposal.implementation_line (org_id, proposal_version_id, request_id);

GRANT SELECT ON proposal.activity TO proposal_svc;
GRANT EXECUTE ON FUNCTION proposal.activity_kind_order(text) TO proposal_svc;
