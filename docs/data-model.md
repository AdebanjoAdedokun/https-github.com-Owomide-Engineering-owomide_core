# Canonical Data Model

This document defines the proposed data spine for Owomide's first implementation pass.

The design principle is:

> Accept messy customer data at the edge; commit only typed, org-scoped, versioned records into the pricing core.

## Scope

This document covers:

- tenant/org boundary;
- core Catalog entities;
- import-facing entities;
- proposal-facing entities;
- price/cost dimensions;
- fields that should stay flexible until customer data proves they deserve canonical columns.

It does not define final migrations. Migrations should be created service-by-service after this model is accepted.

## Tenant Boundary

Use `org_id` as the tenant boundary.

Rules:

- every customer-owned table includes `org_id`;
- every service request derives `org_id` from authenticated context, not from a user-editable body field;
- indexes and uniqueness constraints for customer-owned records start with `org_id` where practical;
- events for customer-owned objects include `org_id`;
- object-store paths include `org_id` for import files, export packs, and snapshots.

## Core Catalog Entities

### `product`

Represents the commercial product concept.

Required fields:

- `id`
- `org_id`
- `name`
- `category`
- `manufacturer` or `brand`
- `attributes JSONB`
- `created_at`
- `updated_at`

Notes:

- `attributes` can hold source-specific fields such as model, size, color, tax class, or legacy category until they are promoted.
- Do not store raw import payloads here.

### `sku`

Represents the sellable unit being priced.

Required fields:

- `id`
- `org_id`
- `product_id`
- `sku_code`
- `internal_id` nullable
- `gtin` nullable
- `ean` nullable
- `upc` nullable
- `mpn` nullable
- `pack_size` nullable
- `unit` nullable
- `attributes JSONB`
- `created_at`
- `updated_at`

MVP uniqueness:

- unique active `sku_code` per `org_id`;
- optional unique indexes for identifiers only where the source data quality supports it.

Do not assume every product has a clean GTIN. Research from pricing and feed platforms shows private-label or local-market products may lack global identifiers.

### `channel`

Represents a route to market or price book surface.

Examples:

- wholesale;
- retail;
- ecommerce;
- marketplace;
- distributor;
- key account;
- custom channel imported from a customer's ERP/POS.

Required fields:

- `id`
- `org_id`
- `code`
- `name`
- `currency`
- `attributes JSONB`

### `location`

Represents a geography, warehouse, store, route, or market zone when prices/costs vary geographically.

Required fields:

- `id`
- `org_id`
- `code`
- `name`
- `country`
- `region` nullable
- `attributes JSONB`

### `customer_segment`

MVP may defer UI for this, but the model should allow it.

Examples:

- key accounts;
- modern trade;
- general trade;
- distributor tier;
- wholesale tier;
- contract group.

Required fields:

- `id`
- `org_id`
- `code`
- `name`
- `attributes JSONB`

## Price And Cost Records

### `cost_record`

Represents the cost basis used by Margin and pricing decisions.

Required fields:

- `id`
- `org_id`
- `sku_id`
- `location_id` nullable
- `cost_minor`
- `currency`
- `effective_at`
- `effective_until` nullable
- `recorded_at`
- `superseded_at` nullable
- `source`
- `source_ref`
- `created_at`

`source` values:

- `import`
- `manual`
- `system`
- `proposal`

### `price_record`

Represents a canonical sell price.

Required fields:

- `id`
- `org_id`
- `sku_id`
- `channel_id`
- `location_id` nullable
- `customer_segment_id` nullable
- `price_minor`
- `currency`
- `effective_at`
- `effective_until` nullable
- `recorded_at`
- `superseded_at` nullable
- `source`
- `source_ref`
- `created_at`

`source_ref` should point to the creating object where possible:

- `import_batch.id` for committed imports;
- `proposal.id` for published proposals;
- migration/seed ID for fixtures.

## Import-Facing Entities

These live in `import_export`, not Catalog.

### `import_batch`

Required fields:

- `id`
- `org_id`
- `owner_id`
- `source_file_url`
- `source_filename`
- `source_type`
- `status`
- `channel_id` nullable
- `customer_segment_id` nullable
- `template_id` nullable
- `created_at`
- `committed_at` nullable

### `import_row`

Required fields:

- `id`
- `org_id`
- `batch_id`
- `row_number`
- `raw_data JSONB`
- `mapped_data JSONB`
- `row_status`
- `excluded_reason` nullable

### `mapping_template`

Required fields:

- `id`
- `org_id`
- `name`
- `source_system` nullable
- `channel_id` nullable
- `customer_segment_id` nullable
- `mappings JSONB`
- `transformation_rules JSONB`
- `created_by`
- `created_at`
- `updated_at`

## Proposal-Facing Entities

These live in `proposal`, not Catalog.

### `proposal`

Required fields:

- `id`
- `org_id`
- `state`
- `owner_id`
- `title`
- `rationale` nullable
- `change_set_ref` nullable
- `created_at`
- `updated_at`

### `proposal_line`

Required fields:

- `id`
- `org_id`
- `proposal_id`
- `sku_id`
- `channel_id`
- `location_id` nullable
- `customer_segment_id` nullable
- `current_price_minor`
- `proposed_price_minor`
- `currency`
- `effective_at`
- `reason`

## Flexible Versus Canonical Fields

Use this decision rule:

| If the field... | Store it as... |
|---|---|
| is required for pricing, margin, approval, or analytics | typed canonical column |
| varies by customer/source and is only needed for mapping/debugging | import `raw_data` or `mapped_data` |
| is useful for display/filtering but not yet stable | `attributes JSONB` |
| drives service behavior | typed column plus validation rule |
| identifies provenance | typed source/source_ref fields |

## First Migration Implications

The first Catalog migration should prioritize:

- `org_id` on every table;
- integer minor-unit money fields;
- currency code fields;
- effective and recorded timestamps on price/cost records;
- uniqueness for current records within a dimension;
- foreign keys scoped in a way that prevents cross-org references;
- indexes for common reads:
  - current price by org/sku/channel;
  - price as-of by org/sku/channel/effective date;
  - current cost by org/sku/location;
  - SKU lookup by org/sku_code.
