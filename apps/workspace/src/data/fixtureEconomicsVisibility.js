// Explicit sample field policy, not a production mapping of the Viewer role.
// Apply these projections before data crosses the repository boundary.
export const ECONOMICS_READ = "pricing:economics:read";
const restricted = { economics: "restricted", reason: "Pricing economics require separate permission." };
const clone = (value) => structuredClone(value);
export const canReadEconomics = (session) => session.effectiveCapabilities.includes(ECONOMICS_READ);

// Revision lineage retains human-authored decision text. Copying a returned
// Proposal's lineage must not make that text visible through another surface.
export function projectRevisionEconomics(value, session) {
  if (canReadEconomics(session)) return value;
  const redactOrigin = (origin) => origin ? {
    ...clone(origin),
    ...(origin.returnDecision ? { returnDecision: { ...clone(origin.returnDecision), reason: restricted.reason } } : {}),
  } : origin;
  const projected = redactOrigin(value);
  if (projected.revisionOrigin) projected.revisionOrigin = redactOrigin(projected.revisionOrigin);
  if (projected.pricingRevision) projected.pricingRevision = redactOrigin(projected.pricingRevision);
  if (projected.revisionHistory) projected.revisionHistory = projected.revisionHistory.map(redactOrigin);
  if (projected.scopeSnapshot?.revisionOrigin) projected.scopeSnapshot.revisionOrigin = redactOrigin(projected.scopeSnapshot.revisionOrigin);
  return projected;
}

export function projectCatalogEconomics(value, session) {
  if (canReadEconomics(session)) return value;
  return { ...clone(value), currentCost: null, costState: "unavailable", marginBasisPoints: null, fieldVisibility: clone(restricted) };
}

export function projectLineEconomics(value) {
  const line = clone(value);
  return {
    ...line, currentCost: null, costState: "unavailable", currentMarginBasisPoints: null, proposedMarginBasisPoints: null,
    remediationInputs: null, remediationEvidence: null, allowedRemediations: [], fieldVisibility: clone(restricted),
    issue: line.issue ? { kind: line.issue.kind, code: line.issue.code, message: "Review required. Pricing evidence is restricted.", persistent: line.issue.persistent, allowedRemediations: [] } : null,
    exclusion: line.exclusion ? { ...line.exclusion, reason: "Excluded from the selected scope." } : null,
    policy: {
      result: line.policy.result, floorBasisPoints: null, floorPrice: null, scope: null, sourceId: null, violation: null,
      evaluation: { status: "restricted", appliedRule: null, matchingChain: [], explanation: restricted.reason, engineVersion: null, evaluationHash: null },
    },
  };
}

export function projectPreviewEconomics(value, session) {
  if (canReadEconomics(session)) return value;
  return { ...projectRevisionEconomics(value, session), lines: value.lines.map(projectLineEconomics), remediationEvidence: [], fieldVisibility: clone(restricted) };
}

export function projectProposalEconomics(value, session) {
  if (canReadEconomics(session)) return value;
  const detail = projectRevisionEconomics(value, session);
  detail.fieldVisibility = clone(restricted);
  // Discussion and decision text may contain financial evidence. It is not
  // safe to redact only the structured numbers while returning those notes.
  if (detail.override) detail.override = { ...detail.override, reason: restricted.reason, evidence: restricted.reason };
  if (detail.returnDecision) detail.returnDecision = { ...detail.returnDecision, reason: restricted.reason };
  detail.activity = (detail.activity ?? []).map(({ id, sequence, occurredAt, eventType, object, actorId, actorRole, sourceType, isSynthetic }) => ({ id, sequence, occurredAt, eventType, object, actorId, actorRole, sourceType, isSynthetic, before: null, after: null, reason: restricted.reason }));
  return detail;
}

export function projectMarginEconomics(value, session) {
  if (canReadEconomics(session)) return value;
  return {
    ...clone(value), fieldVisibility: clone(restricted), lines: value.lines.map(projectLineEconomics),
    policySnapshot: { kind: "retained-rule-snapshot", version: value.policySnapshot.version, label: "Restricted pricing evidence", effect: restricted.reason, floorRangeBasisPoints: { minimum: null, maximum: null } },
  };
}
