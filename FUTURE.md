# Future Considerations

## Infra repo extraction (deferred)

Decision (2026-07-01): k8s manifests stay in `owomide_core` under `infra/k8s/`.

Revisit when:
- Adopting ArgoCD or Flux (GitOps tooling that watches a dedicated repo)
- A separate platform/infra team exists with different access controls
- Multiple app repos need to share the same manifests

At that point, extract `infra/k8s/` + `skaffold.yaml` into a sibling `owomide_infra` repo.
The migration runner (`tools/scripts/migrate/`) and `infra/db/roles.yaml` stay in `owomide_core`
always — they co-locate with service migrations.

## Custom roles (RBAC v2)

Decision (2026-09): F0.10 ships system roles only — 11 global roles, fixed grants, no
per-org customization. `rbac.role`/`rbac.role_permission` are already shaped to hold
org-scoped rows (a custom role is just a `role` row with `org_id` set and its own
`role_permission` grants — no schema change needed when this lands), but nothing
creates one yet.

Entry point when this is built: `DuplicateRole(source_role_id, org_id, new_name)` —
copies an existing role's (system or custom) current grants into a new org-owned row,
which the org then edits via checkboxes. This backs a "Duplicate & Customize" UI action
rather than a blank-slate role builder, since starting from a known-good grant set is
both simpler to build and safer for the org than composing 55 checkboxes from scratch.

Revisit when:
- An org asks for a role the 11 system roles don't cover
- A permissions-admin screen is being built anyway (natural place to add `ListRoles`/`ListPermissions` too, per `docs/rbac/RBAC.md` §6)
