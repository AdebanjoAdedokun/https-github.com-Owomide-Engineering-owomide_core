# ADR-014: Frontend applications live in the core monorepo

## Status

Accepted.

## Context

Owómídé has a public marketing experience and a distinct authenticated
pricing workspace. Maintaining those applications in an unrelated prototype or
standalone repository makes changes to Gateway contracts, permissions and
deployment configuration harder to review as one release.

Putting all source in one repository does not mean serving every component from
one process. The public site, workspace and Gateway have different security,
scaling and release concerns.

## Decision

- `apps/marketing` owns the public `owomide.com` experience.
- `apps/workspace` owns login and the authenticated `app.owomide.com` journey.
- Backend services remain in `src/`.
- Shared browser code moves to `packages/` only when at least two applications
  consume it; empty abstraction packages are not created speculatively.
- Each frontend produces its own immutable container image.
- `app.owomide.com/api/*` routes to the Gateway. Internal services stay private.
- Local fixture mode remains explicit and fail-closed. A live workspace adapter
  may be enabled only after its checked-in backend contract gate is complete.

## Consequences

Frontend and backend changes can share one pull request, lockfile, CI result and
deployment record. Marketing and workspace can still be released or rolled
back independently. Same-origin API routing avoids unnecessary browser CORS and
cookie complexity.
