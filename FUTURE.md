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
