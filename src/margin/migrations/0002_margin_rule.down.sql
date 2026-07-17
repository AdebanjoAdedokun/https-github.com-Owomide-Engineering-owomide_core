-- Rollback: 0002_margin_rule
-- Service: margin
-- ⚠️  DESTRUCTIVE: drops margin_rule and margin_rule_application and all data.

DROP TABLE IF EXISTS margin.margin_rule_application;
DROP TABLE IF EXISTS margin.margin_rule;
DROP FUNCTION IF EXISTS margin.set_updated_at();
DROP FUNCTION IF EXISTS margin.current_org_id();
