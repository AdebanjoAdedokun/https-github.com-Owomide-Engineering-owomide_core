-- Rollback: 0005_harden_privileges
-- Service: governance
-- Restores the runner's default grants (the state before this migration).
COMMENT ON TABLE governance.snapshot IS NULL;
COMMENT ON TABLE governance.audit_log IS NULL;
GRANT DELETE ON governance.restore_request TO governance_svc;
GRANT UPDATE, DELETE ON governance.snapshot TO governance_svc;
GRANT UPDATE, DELETE ON governance.audit_log TO governance_svc;
