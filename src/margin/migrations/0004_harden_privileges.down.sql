-- Rollback: 0004_harden_privileges
-- Service: margin
GRANT EXECUTE ON FUNCTION margin.get_rule_targets(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION margin.get_monitored_orgs() TO PUBLIC;
COMMENT ON TABLE margin.margin_rule_application IS NULL;
GRANT UPDATE, DELETE ON margin.margin_rule_application TO margin_svc;
GRANT DELETE ON margin.margin_rule TO margin_svc;
