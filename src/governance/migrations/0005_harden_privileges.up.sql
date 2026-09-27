-- Migration: 0005_harden_privileges
-- Service: governance
--
-- The migration runner grants governance_svc SELECT, INSERT, UPDATE and DELETE on every new
-- table by default (tools/scripts/migrate/src/runner.ts, ALTER DEFAULT PRIVILEGES). Migrations
-- 0002 to 0004 granted less but did not revoke the defaults, so in a runner-built database the
-- audit log could be edited and deleted by the service. This makes the stated rules true:
-- the audit log and snapshots are append-only, and nothing is deleted.

REVOKE UPDATE, DELETE ON governance.audit_log FROM governance_svc;
REVOKE UPDATE, DELETE ON governance.snapshot FROM governance_svc;
REVOKE DELETE ON governance.restore_request FROM governance_svc;

COMMENT ON TABLE governance.audit_log IS 'Immutable audit trail of subscribed events. @append-only';
COMMENT ON TABLE governance.snapshot IS 'Point-in-time snapshots of Catalog state. @append-only';
