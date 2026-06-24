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

## Database (schema: `notify`)

- `notification` — id, org_id, user_id, event_type, title, body, read, created_at.
- `notification_preference` — id, org_id, user_id, event_type, email_enabled, in_app_enabled.

Postgres role `notify_svc` has access to schema `notify` only.

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
