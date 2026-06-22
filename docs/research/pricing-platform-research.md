# Pricing Platform Research Notes

Date: 2026-06-22

Purpose: capture research-backed assumptions for Owomide's data model, import pipeline, price history, and analytics path before schema and service implementation begins.

This is not a final customer-discovery document. It is a starting point based on public product/docs research from pricing, commerce, rules-engine, and database platforms.

## Executive Summary

Comparable pricing tools converge on the same product pattern:

- pricing data arrives through feeds, CSV/XLSX, APIs, ERP/PIM/POS systems, or ecommerce platforms;
- product identity is messy and often includes SKU, internal ID, GTIN/EAN/UPC/MPN, product URL, competitor URL, variants, and custom attributes;
- imported data is validated before it is applied;
- business users need a review/approval step before major pricing changes become live;
- pricing rules need guardrails, simulation, and auditability;
- historical price visibility is valuable for decision making, not only reporting.

Owomide should therefore keep a strict separation:

1. Import layer accepts messy, flexible, source-specific data.
2. Mapping layer translates data into Owomide canonical fields.
3. Validation layer decides which rows can be committed.
4. Catalog stores typed, org-scoped, versioned records only.
5. Proposal governs approval and publish.
6. Governance records the event trail.

## Evidence From Comparable Products

| Source | Useful evidence | Owomide implication |
|---|---|---|
| Price2Spy custom feed docs | Product feeds can arrive as CSV, XML, or JSON. | Import/Export should keep raw source payloads and support flexible file/feed formats over time. |
| Price2Spy data import docs | Uploaded imports are processed and summarized before the user confirms. | Owomide should not commit immediately after upload; validation summary and confirm/commit are required. |
| Jumpseller pricing import docs | Price imports validate existing product identity, price list name, variants, numeric prices, and large-file behavior before applying. | Owomide validation rules should cover identity matching, price list/channel matching, variant matching, numeric parsing, and batch sizing. |
| Pricefx product extension docs | Users can export data to XLSX/CSV, edit, import back with validation, or use an Import Manager workflow with optional approval. | Owomide should support export/edit/import loops and optionally route high-impact imports through proposals/approval. |
| Pricefx price list docs | Price lists can be global/local, SKU-level, target-date driven, and generated from logic/results mapping. | Owomide needs SKU-level price records with channel/location/segment dimensions and effective dates. |
| PriceShape product pages and FAQ | Pricing teams track competitor prices, stock, product details, price history, market data, margin guardrails, ERP feeds, CSV/JSON/XML, FTP, API, BI tools. | Owomide should model provenance, competitor/market data as future services, and make analytics/export paths explicit. |
| GoRules docs | Decision tables are spreadsheet-like, each row is conditions plus outcomes, and changes can be tested before deployment. | Margin and repricing rules should be business-readable, testable, versioned, and not opaque code blobs. |
| PostgreSQL RLS docs and Supabase RLS docs | Row-level access control is a database primitive and Supabase expects RLS for exposed schemas. | `org_id` belongs in the schema from day one, even if all access initially flows through backend services. |
| PostgreSQL range/exclusion constraint docs | Exclusion constraints can prevent overlapping ranges. | Cost/price validity windows should be designed so overlapping active prices can be prevented by constraints or transaction logic. |
| Trino Iceberg docs | Iceberg supports schema evolution, metadata history, and large analytic table management. | Iceberg/Trino is a future analytics layer, not an MVP operational store. |

## Source Links

- Price2Spy custom feed formats: https://www.price2spy.com/interfaces/custom_price2spy_format.html
- Price2Spy data import: https://www.price2spy.com/data-import.html
- Jumpseller pricing CSV import: https://jumpseller.com/support/pricing-import/
- Pricefx product extensions import/export: https://knowledge.pricefx.com/pricefx-unity-documentation/administration-and-data-setup/master-data/product-extensions
- Pricefx price lists: https://knowledge.pricefx.com/configuration-engineer-knowledge-base/guides/price-setting-concepts/price-lists
- PriceShape product and FAQ: https://priceshape.com/ and https://priceshape.com/help/frequently-asked-questions
- GoRules decision tables: https://docs.gorules.io/learn/authoring/decision-tables
- PostgreSQL row security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL range types and exclusion constraints: https://www.postgresql.org/docs/current/rangetypes.html
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Trino Iceberg connector: https://trino.io/docs/current/connector/iceberg.html

## Research-Backed Assumptions

### A1. Customer data will be messy

Expect customer files to vary by source system and market. The import layer must handle:

- different headers for the same concept;
- SKU/internal IDs that do not match Catalog yet;
- GTIN/EAN/UPC/MPN when available, but not always;
- product names used as weak identifiers;
- variant fields such as color, size, pack size, unit, model, region;
- currency and unit-of-measure inconsistencies;
- missing costs, missing effective dates, and malformed price values;
- competitor URLs, own product URLs, and image URLs for later market data use.

### A2. Dynamic config belongs in the import layer, not the canonical model

Mapping templates, transformations, validation profiles, and source-specific metadata should be configurable. Canonical Catalog tables should remain typed and queryable.

If a field is source-specific, keep it in `raw_data`, `mapped_data`, or `attributes JSONB`. If it affects core pricing decisions, promote it to a typed canonical column.

### A3. Price records need dimensionality

At minimum, price identity should support:

- `org_id`;
- `sku_id`;
- `channel_id`;
- optional `location_id`;
- optional `customer_segment_id`;
- `currency`;
- business validity;
- source/provenance.

This keeps the MVP simple while allowing global/local price lists, channel prices, regional pricing, and customer-tier prices later.

### A4. Price history is a product feature, not just audit storage

The platform should answer:

- what is the current price?
- what was the price valid on a business date?
- what did Owomide know at a recorded date?
- which import/proposal/user/event created the price?
- what price did a margin calculation use?

### A5. Approval and publish must stay separate

Research from pricing systems supports review/approval workflows. Owomide should keep:

- approval as authorization;
- publish as the Catalog mutation;
- Governance as the event trail;
- Proposal as the only path that turns proposed price changes into canonical price records.

## Open Questions For Customer Discovery

These should be validated when real users/files become available:

- Are initial customers distributors, wholesalers, retailers, brands, or marketplace sellers?
- Do prices vary by customer, customer segment, channel, location, quantity tier, contract, or date?
- Do customers need global price lists and local derived price lists?
- Are backdated imports common?
- Are costs imported directly, derived from purchase data, or manually entered?
- Which systems matter first: CSV/XLSX, ERP, POS, PIM, ecommerce platform, SFTP, API?
- What is the smallest acceptable approval workflow for MVP?
- Which analytics questions must be answered in the first customer demo?
