-- Migration: 0009_cycle_times
-- Service: proposal
-- PostgreSQL 16+
--
-- Measurement (PRD HIST-030): how long each step of the pilot journey takes, derived from the
-- append-only records, so the numbers cannot be edited. Durations are in seconds and NULL until
-- the later step has happened. Both views are security_invoker, so a tenant sees only its own.

CREATE VIEW proposal.version_cycle_time
WITH (security_invoker = true)
AS
SELECT
  v.org_id,
  p.initiative_id,
  v.proposal_id,
  v.id AS proposal_version_id,
  v.version_number,
  v.created_at,
  v.submitted_at,
  d.decided_at,
  d.outcome,
  x.first_export_at,
  i.first_implementation_at,
  extract(epoch FROM v.submitted_at - v.created_at)::bigint AS seconds_to_submit,
  extract(epoch FROM d.decided_at - v.submitted_at)::bigint AS seconds_to_decision,
  extract(epoch FROM x.first_export_at - d.decided_at)::bigint AS seconds_decision_to_export,
  extract(epoch FROM i.first_implementation_at - d.decided_at)::bigint
    AS seconds_decision_to_first_implementation
FROM proposal.proposal_version v
JOIN proposal.proposal p ON p.org_id = v.org_id AND p.id = v.proposal_id
LEFT JOIN proposal.decision d ON d.org_id = v.org_id AND d.proposal_version_id = v.id
LEFT JOIN LATERAL (
  SELECT min(e.exported_at) AS first_export_at
  FROM proposal.export_event e
  WHERE e.org_id = v.org_id AND e.proposal_version_id = v.id
) x ON true
LEFT JOIN LATERAL (
  SELECT min(l.recorded_at) AS first_implementation_at
  FROM proposal.implementation_line l
  WHERE l.org_id = v.org_id AND l.proposal_version_id = v.id AND l.outcome <> 'failed'
) i ON true;

-- One row per Initiative: from creation (usually from the Margin Exposure View after an import)
-- to the first submission, the first decision, the approval and the first price on the shelf.
CREATE VIEW proposal.initiative_cycle_time
WITH (security_invoker = true)
AS
SELECT
  n.org_id,
  n.id AS initiative_id,
  n.type,
  n.created_from,
  n.created_at,
  min(c.submitted_at) AS first_submitted_at,
  min(c.decided_at) AS first_decided_at,
  min(c.decided_at) FILTER (WHERE c.outcome = 'approved') AS approved_at,
  min(c.first_implementation_at) AS first_implementation_at,
  count(DISTINCT c.proposal_version_id) FILTER (WHERE c.submitted_at IS NOT NULL)::integer
    AS versions_submitted,
  extract(epoch FROM min(c.decided_at) - n.created_at)::bigint AS seconds_to_first_decision,
  extract(epoch FROM min(c.decided_at) FILTER (WHERE c.outcome = 'approved') - n.created_at)::bigint
    AS seconds_to_approval,
  extract(epoch FROM min(c.first_implementation_at) - n.created_at)::bigint
    AS seconds_to_first_implementation
FROM proposal.initiative n
LEFT JOIN proposal.version_cycle_time c ON c.org_id = n.org_id AND c.initiative_id = n.id
GROUP BY n.org_id, n.id, n.type, n.created_from, n.created_at;

GRANT SELECT ON proposal.version_cycle_time, proposal.initiative_cycle_time TO proposal_svc;
