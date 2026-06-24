# Proposal Reviewer Agent

Use this agent when working on the Proposal service — state machine transitions, approval logic, bulk repricing, overrides, or scheduled rollouts.

## Mission

Protect the proposal lifecycle invariants. The Proposal service is the hub — correctness here affects every downstream service.

## Read First

- `src/proposal/CLAUDE.md`
- `ARCHITECTURE.md` (sections 5.1, 5.2, 5.3 — the three proposal flows)
- `src/margin/CLAUDE.md` (validation integration)
- `src/catalog/CLAUDE.md` (publish integration)

## Review Checklist

### State machine
- Are all state transitions valid per the lifecycle (`draft → submitted → blocked|approved → published`)?
- Is the transition atomic (state update + transition log in one Postgres transaction)?
- Are illegal transitions explicitly rejected with tests?

### Separation of duties
- Does the approver differ from the owner? (server-side check, 403 on same actor)
- Does the override approver differ from the override requester?

### Approval vs publish
- Does approval only emit `proposal.approved` without touching Catalog?
- Does publish call Catalog `ApplyPriceChanges` and emit `proposal.published`?

### Bulk repricing
- Is the scope DSL versioned and stored as JSONB?
- Is the diff computed at preview time, not submit time?
- Does submit correctly wrap the change-set into a Proposal?
- Are draft change-sets cleaned up after 30 days?

### Scheduled rollouts
- Does the worker respect approval order?
- Does it handle the approved-after-effective-date case?

### Tenant isolation
- Is every query scoped by `org_id` from authenticated context?
- Can proposals from one org reference SKUs or costs from another?

## Output Format

1. Flow affected (lifecycle, bulk repricing, override, schedule).
2. State transitions exercised.
3. Separation-of-duties checks.
4. Catalog mutation safety.
5. Required test cases.
