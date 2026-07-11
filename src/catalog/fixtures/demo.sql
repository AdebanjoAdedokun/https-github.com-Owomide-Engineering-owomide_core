-- Deterministic development/demo fixture. Run after the Catalog migration as an admin role.
-- Creates 100 products, 1,000 SKUs, three channels, reference dimensions,
-- and current plus superseded price/cost history for org-demo.

INSERT INTO catalog.write_operation (
  id, org_id, caller_service, operation_type, idempotency_key, payload_sha256,
  status, response_json, completed_at
) VALUES (
  md5('catalog-demo-operation')::uuid,
  'org-demo',
  'catalog_fixture',
  'upsert_canonical',
  'catalog-demo-v1',
  repeat('0', 64),
  'succeeded',
  '{"fixture":"catalog-demo-v1"}'::jsonb,
  '2026-01-01T00:00:00Z'
) ON CONFLICT (org_id, caller_service, idempotency_key) DO NOTHING;

INSERT INTO catalog.channel (
  id, org_id, code, code_normalized, name, default_currency, attributes
)
VALUES
  (md5('org-demo-retail')::uuid, 'org-demo', 'retail', 'RETAIL', 'Retail', 'NGN', '{"fixture":true}'),
  (md5('org-demo-wholesale')::uuid, 'org-demo', 'wholesale', 'WHOLESALE', 'Wholesale', 'NGN', '{"fixture":true}'),
  (md5('org-demo-online')::uuid, 'org-demo', 'online', 'ONLINE', 'Online', 'NGN', '{"fixture":true}')
ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL DO NOTHING;

INSERT INTO catalog.location (
  id, org_id, code, code_normalized, name, region, country, attributes
)
VALUES
  (md5('org-demo-lagos')::uuid, 'org-demo', 'lagos', 'LAGOS', 'Lagos', 'Lagos', 'NG', '{"fixture":true}'),
  (md5('org-demo-abuja')::uuid, 'org-demo', 'abuja', 'ABUJA', 'Abuja', 'FCT', 'NG', '{"fixture":true}')
ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL DO NOTHING;

INSERT INTO catalog.customer_segment (
  id, org_id, code, code_normalized, name, attributes
)
VALUES
  (md5('org-demo-general-trade')::uuid, 'org-demo', 'general-trade', 'GENERAL-TRADE', 'General Trade', '{"fixture":true}'),
  (md5('org-demo-modern-trade')::uuid, 'org-demo', 'modern-trade', 'MODERN-TRADE', 'Modern Trade', '{"fixture":true}'),
  (md5('org-demo-key-account')::uuid, 'org-demo', 'key-account', 'KEY-ACCOUNT', 'Key Account', '{"fixture":true}')
ON CONFLICT (org_id, code_normalized) WHERE archived_at IS NULL DO NOTHING;

INSERT INTO catalog.product (
  id, org_id, name, category, manufacturer, attributes
)
SELECT
  md5('org-demo-product-' || n)::uuid,
  'org-demo',
  'Demo Product ' || lpad(n::text, 3, '0'),
  'Category ' || ((n - 1) % 10 + 1),
  'Demo Manufacturer ' || ((n - 1) % 5 + 1),
  jsonb_build_object('fixture', true, 'ordinal', n)
FROM generate_series(1, 100) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.sku (
  id, org_id, product_id, sku_code, sku_code_normalized, pack_size, unit, attributes
)
SELECT
  md5('org-demo-sku-' || n)::uuid,
  'org-demo',
  md5('org-demo-product-' || ((n - 1) % 100 + 1))::uuid,
  'DEMO-' || lpad(n::text, 5, '0'),
  'DEMO-' || lpad(n::text, 5, '0'),
  CASE WHEN n % 4 = 0 THEN 12 ELSE 1 END,
  CASE WHEN n % 3 = 0 THEN 'case' ELSE 'each' END,
  jsonb_build_object('fixture', true, 'ordinal', n)
FROM generate_series(1, 1000) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.sku_identifier (
  id, org_id, sku_id, identifier_type, namespace, raw_value, normalized_value, is_primary
)
SELECT
  md5('org-demo-internal-id-' || n)::uuid,
  'org-demo',
  md5('org-demo-sku-' || n)::uuid,
  'internal_id',
  'demo-erp',
  'ERP-' || lpad(n::text, 6, '0'),
  'ERP-' || lpad(n::text, 6, '0'),
  true
FROM generate_series(1, 1000) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.cost_record (
  id, org_id, sku_id, cost_type, amount_minor, currency,
  effective_at, effective_until, recorded_at, superseded_at,
  source_type, source_ref, source_item_ref, write_operation_id,
  superseded_by_operation_id
)
SELECT
  md5('org-demo-old-cost-' || n)::uuid,
  'org-demo',
  md5('org-demo-sku-' || n)::uuid,
  'standard',
  50000 + n * 10,
  'NGN',
  '2025-01-01T00:00:00Z',
  NULL,
  '2025-01-02T00:00:00Z',
  '2026-01-01T00:00:00Z',
  'migration',
  'catalog-demo-v1',
  'old-cost-' || n,
  md5('catalog-demo-operation')::uuid,
  md5('catalog-demo-operation')::uuid
FROM generate_series(1, 1000) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.cost_record (
  id, org_id, sku_id, cost_type, amount_minor, currency,
  effective_at, recorded_at, source_type, source_ref, source_item_ref,
  write_operation_id
)
SELECT
  md5('org-demo-current-cost-' || n)::uuid,
  'org-demo',
  md5('org-demo-sku-' || n)::uuid,
  'standard',
  52500 + n * 10,
  'NGN',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  'migration',
  'catalog-demo-v1',
  'current-cost-' || n,
  md5('catalog-demo-operation')::uuid
FROM generate_series(1, 1000) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.price_record (
  id, org_id, sku_id, channel_id, amount_minor, currency,
  effective_at, recorded_at, source_type, source_ref, source_item_ref,
  write_operation_id
)
SELECT
  md5('org-demo-price-' || channel.code_normalized || '-' || n)::uuid,
  'org-demo',
  md5('org-demo-sku-' || n)::uuid,
  channel.id,
  70000 + n * 15 + CASE channel.code_normalized
    WHEN 'RETAIL' THEN 10000 WHEN 'ONLINE' THEN 5000 ELSE 0 END,
  'NGN',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  'migration',
  'catalog-demo-v1',
  channel.code_normalized || '-price-' || n,
  md5('catalog-demo-operation')::uuid
FROM generate_series(1, 1000) AS n
CROSS JOIN catalog.channel AS channel
WHERE channel.org_id = 'org-demo' AND channel.archived_at IS NULL
ON CONFLICT (id) DO NOTHING;
