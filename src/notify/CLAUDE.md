# Notify Service

Event subscriber that fans out notifications to users. Email via Zoho ZeptoMail, in-app notification storage and delivery.

This service never blocks upstream flows. It listens on the bus, decides who to notify based on roles and preferences, and sends.

---

## What this owns

- Email delivery via Zoho ZeptoMail (transactional email).
- In-app notification storage and read/unread state.
- Notification preferences per user (which events, which channels).
- Template rendering for email and in-app messages.
- Org-scoped notification access.

## What this does not own

- Business logic of any kind — it reacts to events, it doesn't produce them.
- User management — it reads user/role info from Gateway auth context or a shared user lookup.

---

## Events consumed

| Event | Action |
|---|---|
| `proposal.submitted` | Email the approver: "A proposal needs your review" |
| `proposal.blocked` | Email the proposal owner: "Your proposal was blocked — margin violations" |
| `proposal.approved` | Email the proposal owner: "Your proposal was approved" |
| `proposal.published` | Email the owner + approver: "Price changes are live" |
| `override.requested` | Email potential approvers: "An override needs your approval" |
| `override.approved` | Email the override requester: "Your override was approved" |
| `import.committed` | Email the uploader: "Import complete — X rows committed, Y errors" |

### Events emitted

None.

---

## Public contract

### gRPC methods

- `ListNotifications(ListRequest) → NotificationList` — in-app notifications for current user.
- `MarkRead(MarkReadRequest) → Empty` — mark notification(s) as read.
- `GetPreferences(GetPreferencesRequest) → Preferences` — notification preferences for current user.
- `UpdatePreferences(UpdatePreferencesRequest) → Preferences`

### REST (via Gateway)

- `GET /notifications` → ListNotifications
- `POST /notifications/read` → MarkRead
- `GET /notifications/preferences` → GetPreferences
- `PUT /notifications/preferences` → UpdatePreferences

---

## Database (schema: `notify`, migration 0002)

- `notification` — one row per (source event, recipient), unique, so a redelivered event creates
  nothing new. Content is immutable; `read_at` is set once (column-level UPDATE grant plus a
  trigger). `show_in_app` is false for email-only notifications.
- `notification_preference` — (org, user, event type) → `email_enabled`, `in_app_enabled`. No row
  means both on. In-app cannot be switched off for requests that need someone to act
  (`proposal.submitted`, `proposal.published`, `override.requested`).
- `email_delivery` — at most one email per notification. The sender leases and settles rows only
  through `claim_email_deliveries`, `mark_email_sent` and `mark_email_failed` (SECURITY DEFINER;
  exponential backoff capped at one hour; `failed` after the attempt limit). A failed email never
  affects the in-app notification or any upstream flow.
- `proposal_participant` — projection of each Proposal's submitter and approver, built from
  `proposal.submitted` / `proposal.approved`, because later events do not repeat the submitter.

All tables force row-level security on `org_id`. Postgres role `notify_svc` has access to schema
`notify` only and holds no DELETE grant.

## Routing (implemented in `src/domain/routing.ts`)

| Event | Recipients |
|---|---|
| `proposal.submitted` | holders of `approval.approve`, never the submitter (FLOW-013) |
| `proposal.blocked` | the submitter |
| `proposal.approved` | the submitter |
| `proposal.published` | the submitter, the approver and holders of `execution.mark_implemented` |
| `override.requested` | holders of `override.approve` |
| `override.approved` | the requester |
| `import.committed` | the uploader |

Nobody is notified of their own action (except the uploader, whose import finishes later).
Messages never contain prices, costs or margins (`src/domain/templates.ts`).

## Status

Implemented and tested:
- schema, routing, templates, event decoding and the idempotent `handleEvent` handler;
- the inbox and preference repository;
- `clients/zeptomail.ts` — ZeptoMail `POST /v1.1/email` with the agent's
  `Zoho-enczapikey` token, plain text, no open or click tracking. 4xx (except 408, 425 and 429)
  is permanent; 5xx, 429 and network errors are retried;
- `workers/email-sender.ts` — leases queued emails across tenants, sends, records the provider
  request id, backs off on retryable failures and fails permanent ones immediately. Never logs
  recipient addresses;
- `subscribers/notification-subscriber.ts` — consumer group `notify.inapp` on every locked event;
- `server.ts` — `/healthz`, `/readyz` (database) and the email sender. Without
  `ZEPTOMAIL_TOKEN`, emails stay queued.

Configuration: `NOTIFY_DATABASE_URL`, `NOTIFY_APP_BASE_URL` (required); `ZEPTOMAIL_TOKEN`,
`NOTIFY_FROM_ADDRESS`, `NOTIFY_FROM_NAME`, `ZEPTOMAIL_API_URL` (regional hosts differ),
`ZEPTOMAIL_TIMEOUT_MS`, `NOTIFY_EMAIL_BATCH_SIZE`, `NOTIFY_EMAIL_POLL_MS`,
`NOTIFY_EMAIL_MAX_ATTEMPTS`, `NOTIFY_HEALTH_PORT`, `LOG_LEVEL`, `KAFKA_BROKER`.

Not yet wired: the server does not start the bus subscriber, because the `RecipientDirectory`
needs RBAC's `members_with_permission` (RBAC migration 0006) exposed as an RPC, which needs
`make proto`. The gRPC inbox API needs the same. No Kubernetes manifests exist for Notify yet.

---

## Dependencies

- **Bus** (Kafka) — subscribe to all locked events.
- **Zoho ZeptoMail API** — transactional email delivery.

---

## Critical rules

1. **Never block upstream flows.** If Zoho is down, queue and retry. A failed notification must never cause a proposal or import to fail.
2. **Every notification is scoped by `org_id`.** Users can only see notifications for their own org.
3. **Idempotent handlers.** Duplicate events must not send duplicate emails. Dedupe by `event.id`.
4. **Consumer group: `notify.email`** for email fan-out, `notify.inapp` for in-app storage.

---

## Files (target layout)

```
src/notify/
├── CLAUDE.md
├── BUILD.bazel
├── migrations/
├── package.json
└── src/
    ├── server.ts
    ├── handlers/
    │   ├── event-handlers.ts    (bus subscribers)
    │   └── api-handlers.ts      (gRPC methods)
    ├── domain/
    │   ├── templates/           (email + in-app templates)
    │   └── preferences.ts
    ├── clients/
    │   └── zeptomail.ts         (Zoho ZeptoMail API client)
    ├── repo/
    └── tests/
```
