# RBAC Service

RBAC owns every role and permission grant in the system. Other services check a
permission by calling `CheckPermission` over Connect/gRPC — they never read
`rbac` tables directly (schema-per-service; no shared database access).

## Ownership

- `rbac.role` — the 11 global system roles (`org_id IS NULL`, `is_system = true`)
  and, later, per-org custom roles (`org_id` set, `is_system = false`).
- `rbac.role_permission` — one row per **granted** permission. No row means Deny;
  there is no allow/deny column.
- The permission catalog itself is **not** a table. It lives in
  `src/rbac/src/permissions.ts` (55 entries, hand-maintained, transcribed once
  from `docs/rbac/role_permissions.csv`). Small and rarely-changing; moves to a
  table only when custom *permissions* become a thing.

## Public contract

### gRPC

- `CheckPermission(roles, permission) -> { allowed }` — true if any of the
  caller's roles grants the permission for this org. Callers: `gateway_svc`,
  `proposal_svc`, `governance_svc`, `catalog_svc`, `margin_svc`.

Caller identity is a signed, short-lived service JWT with audience `rbac`.
`org_id` / `user_id` / roles come from authenticated metadata headers
(`x-org-id`, `x-user-id`, `x-user-roles`), never a request body.

There are no write RPCs yet. `DuplicateRole` (v2, "Duplicate & Customize" — copy
an existing role's grants into a new org-owned custom role) is tracked in
`FUTURE.md`.

## Model rules

- **System roles are global.** One "Pricing Manager" row, shared by every org,
  seeded once by `0003_seed_system_roles`. Nothing is provisioned per org.
- **Grants are additive.** A user with two roles has the union of both roles'
  permissions.
- **Default deny.** Absence of a `role_permission` row is a denial.
- The seed data (`0003`) is generated from `src/rbac/src/system-role-templates.ts`.
  When the CSV changes: update `permissions.ts` / `system-role-templates.ts`,
  then add a new migration — never edit a shipped one.
- `CheckPermission` rejects an unknown permission code with `InvalidArgument` —
  a caller asking about a permission that isn't in the catalog is a bug, not a
  denial.

## Database (schema: `rbac`)

- `role`, `role_permission` — see Ownership.
- RLS: `role`/`role_permission` `USING (org_id IS NULL OR org_id = current_org_id())`
  for reads (global rows always visible), `WITH CHECK (org_id = current_org_id())`
  for writes (nothing writes a global row through the tenant path).
- Postgres role `rbac_svc` has access to schema `rbac` only.
- `rbac_svc` can only read `role` and `role_permission` (`0004_lock_system_roles`): the global
  system roles are shared by every tenant, so only migrations change them. A future write RPC
  (`DuplicateRole`) grants exactly what it needs in its own migration.

### Organisations, membership and support access (migration 0005)

Decisions D-02 and D-03; PRD ORG-001 to ORG-015. Authority is meant to come from these stored
rows, resolved per request by `rbac.active_role_codes(org_id, identity_subject)`, rather than
from token claims. `CheckPermission` still takes roles from the request until the gateway
resolves them (that needs a new RPC and a `make proto` run).

- `organisation` — name, country, default currency and time zone, default tax basis and rate
  (basis points), AI data policy (AI-036), and `enabled_role_codes` (Release 1: account_owner,
  pricing_manager, finance_approver, executor). Created only through
  `rbac.create_organisation(...)` (SECURITY DEFINER), which also creates the creator's account,
  active membership, Account Owner role and first access-log entry.
- `user_account` — one row per person across organisations, keyed by the identity provider's
  subject. Not tenant data.
- `membership` — status `invited` | `active` | `suspended` | `removed`.
- `role_assignment` — only enabled roles can be assigned; rows are revoked, never changed or deleted.
- An organisation always keeps at least one active Account Owner (deferred constraint trigger,
  so an ownership transfer inside one transaction works).
- `invitation` — stores only a SHA-256 of the one-time token; expires within 14 days.
- `support_access_grant` — purpose, start and a required end at most 30 days later; revoked,
  never changed.
- `access_log` — append-only; every support action records its grant id.
- No DELETE grant to `rbac_svc` on any of these tables.

`CheckPermission` refuses the permissions in `src/support-access.ts` (submit, approve, reject,
request changes, override approve, mark implemented, schedule, confirm governance changes,
invite, assign roles, deactivate users) whenever the request carries `x-support-grant-id`,
whatever roles are present.

Note: the seeded system roles include `ai_assistant` but not a Workspace Admin role. Decision
D-02 keeps Workspace Admin as a named role (from Release 2), so a later migration needs to add it.

## Runtime

- Connect/gRPC server: `50056`
- health/readiness HTTP server: `8080`
- schema: `rbac`; runtime role: `rbac_svc`
- no event bus, no worker process

## Verification

```bash
bazel test //src/rbac:unit_tests
bazel test //src/rbac:integration_tests --test_output=errors
```

The integration target requires Docker: applies the migrations, asserts the seed
(11 roles, 194 grants), idempotent re-seed, `CheckPermission` allow/deny/additive
cases, unknown-permission rejection, and service-credential enforcement.
