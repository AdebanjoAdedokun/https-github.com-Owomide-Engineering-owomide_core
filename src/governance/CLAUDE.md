# Governance Service

The audit layer. **Event-subscriber only — no service ever calls Governance directly.**

The fact that no caller can talk to Governance is the design. If audit were a function call, someone would eventually forget to call it. By making it a subscription on events that fire anyway, audit becomes impossible to bypass.

---

## What this owns

- The append-only, org-scoped `audit_log` of every meaningful event in the system.
- Periodic snapshots of canonical state (for restore).
- Read-only APIs for the activity feed and audit-trail UIs.
- The restore workflow (replays from snapshot + log to a target timestamp).

## What this does not own

- Anything write-facing in the rest of the system.
- Notifications → **Notify**.
- The events themselves — we don't define them, we observe them.

---

## Public contract

### gRPC methods

- `GetActivityFeed(GetActivityFeedRequest) → ActivityFeedResponse` — reverse-chronological event list, filterable by entity (proposal, override, import), actor, time range.
- `GetEntityHistory(GetEntityHistoryRequest) → EntityHistoryResponse` — all events for a single entity (e.g. one proposal's full lifecycle).
- `ListSnapshots(ListSnapshotsRequest) → ListSnapshotsResponse` — available snapshots.
- `Restore(RestoreRequest) → RestoreResult` — replays a snapshot + log up to a target timestamp into a target environment. **Staging-gated; production restore requires explicit flag + human approval recorded as its own audit event.**

### REST (via Gateway)

- `GET /audit/feed` → GetActivityFeed
- `GET /audit/entities/:type/:id` → GetEntityHistory
- `GET /audit/snapshots` → ListSnapshots
- `POST /audit/restore` → Restore (admin role)

### Events emitted

None at MVP. (Future: `governance.restore_completed` for chains-of-custody.)

### Events consumed

All locked events, plus catalog mutations once exposed:

- `proposal.submitted`
- `proposal.blocked`
- `proposal.approved`
- `proposal.published`
- `override.requested`
- `override.approved`
- `import.committed`

Plus low-level catalog mutations once we expose them as events (Phase 5.3+).

---

## Database (schema: `governance`)

- `audit_log` — id, org_id, event_id (idempotency key), event_type, entity_type, entity_id, actor_id, occurred_at, payload JSONB. **Append-only.** No UPDATE, no DELETE — DB-level revoke.
- `snapshot` — id, org_id, snapshot_at, scope (e.g. `catalog`, `full`), storage_url (MinIO object), row_counts JSONB, checksum.
- `restore_request` — id, org_id, requested_by, target_timestamp, target_environment, status, requested_at, completed_at, approval_id (nullable; required for prod).

Postgres role `governance_svc` has GRANTed `INSERT, SELECT` on its own schema and `REVOKE UPDATE, DELETE` on `audit_log`. That's the no-tampering enforcement.

---

## Dependencies

- **Bus** — consume all locked events.
- **Catalog** (read-only via gRPC) for snapshot construction.
- **MinIO** — snapshot storage.

---

## Critical rules

1. **No write path other than event consumption.** No REST or gRPC method writes to `audit_log`. The bus is the only ingest.
2. **Every customer-owned event must carry `org_id`.** Events without `org_id` are dead-lettered unless they are explicitly global system events.
3. **Idempotent on `event_id`.** Re-delivery is expected with at-least-once buses. Duplicate events become no-ops via a UNIQUE constraint on `event_id`.
4. **`audit_log` is append-only at the DB level.** No `UPDATE` or `DELETE` GRANT. If a row was wrong, you write a correcting row, you don't change the existing one.
5. **Snapshots are immutable and org-scoped.** Stored in MinIO with checksum; never rewritten. Old snapshots age out via a separate retention policy job (with its own audit entries).
6. **Production restore requires recorded approval.** A `restore_request` to the prod environment must reference an `approval_id` from a second user. The approval itself emits an audit entry.

---

## Definition of done (MVP)

- [x] Schema migration applied with `org_id`, including REVOKE on UPDATE/DELETE
- [x] Event subscriber for all locked events, idempotent by event_id
- [ ] `GetActivityFeed` returning filtered, paged results
- [ ] `GetEntityHistory` returning per-entity timeline
- [ ] Snapshot worker: dump Catalog tables to MinIO with checksum, hourly schedule
- [ ] Restore workflow (staging-only at MVP; prod gated to Phase 5.6)
- [x] Integration test: fire each locked event → verify org-scoped audit_log rows
- [x] Integration test: same event_id delivered twice → only one audit row
- [ ] Integration test: snapshot → restore → assert canonical state matches
- [ ] `make lint` clean, `bazel test //src/governance/...` green

---

## Files (target layout)

```
src/governance/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
│   ├── 0001_initial.sql
│   └── 0002_revoke_update_delete.sql
└── src/
    ├── server.ts
    ├── subscribers/
    │   ├── proposal-events.ts
    │   ├── override-events.ts
    │   └── import-events.ts
    ├── handlers/
    │   ├── activity-feed.ts
    │   ├── entity-history.ts
    │   └── restore.ts
    ├── workers/
    │   ├── snapshot.ts
    │   └── retention.ts
    ├── domain/
    │   └── replay.ts
    ├── repo/
    └── tests/
```

---

## Conventions specific to this service

- Treat every subscriber as a pure projection: event in, audit row out. Idempotency is enforced at the DB layer, not in handler logic.
- The activity feed is denormalised for query speed — store enough payload in the audit row that a feed render doesn't need to call other services.
- Snapshot scope is currently "Catalog only" (the canonical layer is what restore actually needs). Full-system snapshots are not on the MVP roadmap.
- If a subscriber fails repeatedly on the same event, it goes to a dead-letter stream — never silently drop. Manual review only.
