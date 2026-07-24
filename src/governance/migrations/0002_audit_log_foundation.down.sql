-- Rollback: 0002_audit_log_foundation
-- Service: governance
-- Drops only what 0002 created; leaves the governance schema intact.

REVOKE SELECT, INSERT ON governance.audit_log FROM governance_svc;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance FROM governance_svc;
REVOKE EXECUTE ON FUNCTION governance.current_org_id() FROM governance_svc;

DROP POLICY IF EXISTS audit_log_tenant_policy ON governance.audit_log;
DROP TABLE IF EXISTS governance.audit_log;
DROP FUNCTION IF EXISTS governance.current_org_id();
