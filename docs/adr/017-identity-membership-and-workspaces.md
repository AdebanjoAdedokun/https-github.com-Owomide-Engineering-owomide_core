# ADR-017: Real sign-in, membership and workspaces for Release 1

## Status

Proposed. This is the identity and access slice of CT-02 (issue #52), drafted 27 September 2026 for
BE-01 and FE-01. It assumes the CEO's proposed options for D-02 and D-03. None is ratified:
`DECISIONS.md` holds no ratification record for them yet, and if a ratified choice differs, this ADR
changes with it. It is input to the team's CT-02 draft
(`docs/product/mvp-2026-09/delivery/CT-02-contract-draft.md`); where the two differ, the draft and
its review govern. It needs lead engineer review before any runtime code changes.

## Context

- **Sign-in.** `src/gateway/src/routes/auth.ts` accepts one development email and password from
  config.
- **Tokens.** The gateway middleware (`src/gateway/src/middleware/auth.ts`) already verifies JWTs
  against either a shared secret or a remote JWKS. It reads `sub`, `org_id` and `roles` from the
  token and forwards them to services as headers (`x-user-roles`, read by
  `src/rbac/src/context.ts`).
- **What RBAC stores.** It holds roles and role permissions (`rbac.role`, `rbac.role_permission`) and
  answers `CheckPermission`.
- **What nothing stores:**
  - organisations
  - users
  - who belongs to which organisation
  - which roles a member holds
  - invitations
  - support-access grants

So roles are whatever the token says. A removed or suspended member keeps their authority until their
token expires. The audit's rule "roles are claims only after trusted resolution" is not met.

Release 1 needs (ORG-001 to ORG-015, GOV-015 to GOV-019; J3 steps 1, 2 and 7):
- workspace creation, invitations and secure sign-in
- the Account Owner, Pricing Manager, Finance Approver and Executor roles
- last-owner protection
- time-boxed support access visible to the customer
- organisation isolation

## Decision

### 1. Use a managed sign-in provider for identity only

- **The provider** (any OIDC provider with a JWKS endpoint) proves who the person is: email,
  password or single sign-on, multi-factor authentication, password reset. The gateway's existing
  `JWKS_URL` path is used unchanged.
- **The token carries identity only:** `sub` and email.
- **Organisation membership and roles are never taken from the token.**

Why: building password storage, reset and multi-factor authentication safely would take most of a
month. The gateway already supports this model.

Choosing the provider is the lead engineer's call. Criteria:
- where user data is stored
- a data-processing agreement
- cost at pilot scale
- a free tier for staging

The development login stays available only when `NODE_ENV` is not production. It must be refused in
staging and production by configuration.

### 2. Membership and role assignments are stored and resolved on every request

New tables, owned by the RBAC service (schema `rbac`, with row-level security by organisation as
elsewhere):

| Table | Key columns | Rules |
|---|---|---|
| `organisation` | `id`, `name`, `country`, `default_currency`, `time_zone`, `default_tax_inclusive`, `default_tax_rate_bp`, `ai_data_policy`, `created_by`, `created_at` | `ai_data_policy` is one of `disabled`, `enabled_without_cost_margin` or `enabled` (AI-036). Tax defaults as in ADR-016. |
| `user_account` | `id`, `identity_subject` (unique), `email`, `display_name` | One row per person, across organisations |
| `membership` | `id`, `org_id`, `user_id`, `status` (`invited`, `active`, `suspended`, `removed`), `invited_by`, `joined_at` | Unique on (`org_id`, `user_id`) |
| `role_assignment` | `id`, `org_id`, `membership_id`, `role_id`, `granted_by`, `granted_at`, `revoked_at`, `revoked_by` | Never deleted; revocation is a new timestamp |
| `invitation` | `id`, `org_id`, `email`, `role_codes`, `token_hash`, `expires_at`, `accepted_at`, `invited_by` | Only a hash of the token is stored; it can be used once and expires |
| `support_access_grant` | `id`, `org_id`, `owomide_user_id`, `purpose`, `granted_by`, `starts_at`, `ends_at`, `revoked_at` | Time-boxed; `ends_at` is required |
| `access_log` | `id`, `org_id`, `actor_user_id`, `via_support_grant_id`, `action`, `resource`, `occurred_at` | Append-only. The Account Owner (and later the Auditor) can read it. |

Every change to membership, role assignment, invitation or support access is also appended to the
existing Governance audit.

### 3. The gateway resolves authority per request

On each request, the gateway:
1. Verifies the token.
2. Takes the organisation from the route or a header.
3. Asks RBAC for the active membership and current roles.

It forwards only what RBAC resolved. Results may be cached for at most 60 seconds, so a revocation
takes effect within a minute; this is the proposed bound.

If there is no active membership, the request is refused with 403 and reveals nothing about the
organisation (BDD 1, 2).

### 4. Rules enforced by the service, not the screens

- **Last owner (ORG-009).** Removing, suspending or demoting the last active Account Owner is refused.
  Transferring ownership is a single recorded operation.
- **Release 1 roles (D-02).** Only the four Release 1 roles can be assigned. The other seven stay
  defined but cannot be assigned until Release 2.
- **Setup warning (J3).** If the only person who can submit is also the only approver, setup warns
  that no decision can complete.
- **Support access (ORG-015):**
  - Every support action is written to `access_log` with the grant id.
  - The grant never includes submit, approve, policy-authorise or record-implementation permissions,
    whatever roles are otherwise present.
  - A grant expires automatically, and the Account Owner can revoke it at any time.

### 5. Workspace creation (J3 day 0)

`CreateOrganisation` makes the creator the first Account Owner and records the settings in one step:
country, currency, time zone, tax basis and AI data policy. It also creates the default channel from
ADR-016.

## Verification

| Test | What it proves |
|---|---|
| Two-organisation API tests (BDD 1) | Isolation on list, detail, history and export |
| Revocation within the cache bound (BDD 2) | Removed access actually stops |
| Last-owner refusal (BDD 3) | A workspace can never be left without an owner |
| Support access | The grant cannot submit or approve, expires, and every action appears in the access log |
| Browser journey | Create workspace, invite, accept, sign in and revoke, as in `core-handoff/acceptance-scripts.md` J3 |

## Migration

This is additive: new tables and new RBAC RPCs. In development the gateway keeps accepting
token-carried roles behind a flag until the workspace switches to real sign-in. The flag is removed
before any design-partner data is loaded.

## Open questions for the lead engineer

1. Which sign-in provider?
2. Is the 60-second cache bound acceptable?
3. How is the organisation chosen for someone who belongs to several: a path segment or a header?
