# Gateway Service

Single REST entry point for all external clients. BFF (Backend for Frontend) pattern.

This is the edge. JWT auth, REST→gRPC translation, rate limiting, CORS, and request logging live here. No business logic — pure routing and auth.

---

## What this owns

- JWT authentication and token validation at the edge.
- REST API surface for the frontend (and future external clients).
- REST→gRPC translation for all downstream services.
- Rate limiting per org / per user.
- CORS configuration.
- Request/response logging and error envelope standardization.
- `org_id` extraction from JWT claims and propagation as gRPC metadata.

## What this does not own

- Business logic of any kind — routes to downstream services.
- Database access — no schema, no tables.
- Event publishing or subscribing — not a bus participant.

---

## Public contract

### REST routes

Routes to downstream gRPC services. See each service's CLAUDE.md for the full endpoint list.

| Prefix | Downstream service |
|---|---|
| `/proposals/*` | Proposal |
| `/change-sets/*` | Proposal (bulk repricing) |
| `/override-requests/*` | Proposal |
| `/imports/*` | Data Pipeline |
| `/mappings/*` | Data Pipeline |
| `/exports/*` | Data Pipeline |
| `/intelligence/*` | Data Pipeline |
| `/catalog/*` | Catalog |
| `/margin/*` | Margin |
| `/governance/*` | Governance |

### Error envelope

All responses follow a standard error format:

```json
{
  "code": "MARGIN_VIOLATION",
  "message": "Proposed price is below cost floor",
  "violations": [...]
}
```

---

## Dependencies

- All downstream services via gRPC.
- Auth provider (JWT issuer — details TBD).

---

## Critical rules

1. **`org_id` comes from the JWT, never from the request body.** The gateway extracts it and injects it as gRPC metadata for every downstream call.
2. **No business logic.** If you're tempted to add validation, pricing rules, or data transformation here, it belongs in a downstream service.
3. **Rate limiting is per-org, per-endpoint.** Prevents one customer from starving others.
4. **All downstream errors are wrapped in the standard error envelope.** gRPC status codes map to HTTP status codes.

---

## Files (target layout)

```
src/gateway/
├── CLAUDE.md
├── BUILD.bazel
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── server.ts                  (Fastify app + plugin registration)
    ├── config.ts                  (Zod-validated env config)
    ├── context.ts                 (RequestContext type + Fastify augmentation)
    ├── middleware/
    │   ├── auth.ts                (JWT verification via jose)
    │   ├── cors.ts                (@fastify/cors config)
    │   ├── rate-limit.ts          (per-org rate limiting)
    │   └── error-envelope.ts      (ConnectError → HTTP status + envelope)
    ├── clients/
    │   └── factory.ts             (ConnectRPC v2 typed gRPC client factory)
    ├── routes/
    │   ├── health.ts              (GET /health)
    │   ├── proposals.ts           (REST → ProposalService gRPC)
    │   ├── override-requests.ts   (REST → ProposalService gRPC)
    │   ├── change-sets.ts         (REST → ProposalService gRPC)
    │   ├── catalog.ts             (REST → CatalogService gRPC)
    │   ├── margin.ts              (REST → MarginService gRPC)
    │   ├── governance.ts          (REST → GovernanceService gRPC)
    │   └── data-pipeline.ts       (stubbed 501 — data scientist scope)
    └── tests/
        ├── auth.test.ts
        ├── error-envelope.test.ts
        └── factory.test.ts
```
