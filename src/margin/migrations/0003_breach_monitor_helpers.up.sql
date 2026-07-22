-- Partial index supporting the cross-org enumeration in get_monitored_orgs().
-- Without this, every monitor cycle does a sequential scan of margin_rule.
CREATE INDEX IF NOT EXISTS margin_rule_monitor_orgs_idx
  ON margin.margin_rule (org_id, effective_at)
  WHERE is_active = true AND sku_id IS NOT NULL AND channel_id IS NOT NULL;

-- Returns all distinct org_ids with at least one currently active scoped rule.
-- SECURITY DEFINER bypasses RLS so the monitor can enumerate all orgs without
-- setting app.org_id first (which would restrict to a single org).
-- VOLATILE (not STABLE) because clock_timestamp() returns wall time per call.
-- SET search_path guards against search-path injection on future edits.
CREATE OR REPLACE FUNCTION margin.get_monitored_orgs()
RETURNS TABLE(org_id uuid)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
SET search_path = margin, pg_catalog
AS $$
  SELECT DISTINCT org_id FROM margin.margin_rule
  WHERE is_active = true
    AND effective_at <= clock_timestamp()
    AND (effective_until IS NULL OR effective_until > clock_timestamp())
    AND sku_id IS NOT NULL
    AND channel_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION margin.get_monitored_orgs() TO margin_svc;

-- Returns (sku_id, channel_id) pairs covered by scoped rules for a given org.
-- Org-wide rules (sku_id IS NULL OR channel_id IS NULL) are excluded: scanning
-- all prices for an org is unbounded; the caller must handle them separately.
CREATE OR REPLACE FUNCTION margin.get_rule_targets(p_org_id uuid)
RETURNS TABLE(sku_id uuid, channel_id uuid)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
SET search_path = margin, pg_catalog
AS $$
  SELECT DISTINCT sku_id, channel_id FROM margin.margin_rule
  WHERE org_id = p_org_id
    AND is_active = true
    AND effective_at <= clock_timestamp()
    AND (effective_until IS NULL OR effective_until > clock_timestamp())
    AND sku_id IS NOT NULL
    AND channel_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION margin.get_rule_targets(uuid) TO margin_svc;
