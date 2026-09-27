-- Rollback: 0003_tax_basis_cost_unit_resolution
-- Service: catalog
DROP FUNCTION IF EXISTS catalog.resolve_applicable_costs(jsonb, timestamptz);
DROP FUNCTION IF EXISTS catalog.resolve_current_prices(jsonb, timestamptz);
DROP TRIGGER IF EXISTS price_record_apply_default_tax_basis ON catalog.price_record;
DROP FUNCTION IF EXISTS catalog.apply_default_tax_basis();
DROP FUNCTION IF EXISTS catalog.configure_pricing_settings(boolean, integer, text, text, text);
DROP TABLE IF EXISTS catalog.pricing_settings;
ALTER TABLE catalog.cost_record DROP COLUMN IF EXISTS unit;
ALTER TABLE catalog.price_record
  DROP CONSTRAINT IF EXISTS price_record_tax_rate_needs_basis,
  DROP CONSTRAINT IF EXISTS price_record_tax_basis_consistent,
  DROP COLUMN IF EXISTS tax_basis_source,
  DROP COLUMN IF EXISTS tax_rate_bp,
  DROP COLUMN IF EXISTS tax_inclusive;
