-- Migration: 0004_harden_privileges
-- Service: margin
--
-- The migration runner grants margin_svc SELECT, INSERT, UPDATE and DELETE on every new table by
-- default, so "GRANT SELECT, INSERT" in 0002 did not stop updates or deletes. Rules are retired
-- with is_active/effective_until and never deleted; the application log is append-only. The two
-- cross-tenant SECURITY DEFINER helpers from 0003 were executable by PUBLIC.

REVOKE DELETE ON margin.margin_rule FROM margin_svc;
REVOKE UPDATE, DELETE ON margin.margin_rule_application FROM margin_svc;

COMMENT ON TABLE margin.margin_rule_application IS
  'Which rule applied to which validation, for transparency. @append-only';

REVOKE ALL ON FUNCTION margin.get_monitored_orgs() FROM PUBLIC;
REVOKE ALL ON FUNCTION margin.get_rule_targets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION margin.get_monitored_orgs() TO margin_svc;
GRANT EXECUTE ON FUNCTION margin.get_rule_targets(uuid) TO margin_svc;
