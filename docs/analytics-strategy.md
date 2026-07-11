# Analytics Strategy

Owomide should start with operational analytics in Postgres and keep a clear path to warehouse/lakehouse analytics later.

## MVP Position

Do not make Iceberg/Trino part of MVP.

Reasons:

- operational workflows need transactional correctness first;
- Postgres can handle early reporting over Catalog, Proposal, Import, and Governance tables;
- introducing Iceberg/Trino early adds operational overhead before volume justifies it;
- event and export design can keep the path open without committing to lakehouse infrastructure now.

## MVP Analytics Questions

The first implementation should support:

- current prices by SKU/channel/location/segment;
- price as of business date;
- margin by SKU/channel;
- proposals by state and owner;
- blocked proposals and violation reasons;
- approval cycle time;
- import success/failure rate;
- rows excluded or errored by validation code;
- price changes by proposal/import/source;
- audit timeline for a SKU or proposal.

## Operational Data Sources

| Source | Analytics use |
|---|---|
| Catalog | current and historical price/cost records |
| Proposal | pricing change workflow, approval cycle, publish timing |
| Margin | violations, rule coverage, override patterns |
| Data Pipeline | import quality, source reliability, mapping reuse |
| Governance | immutable activity trail |
| Repricing | change-set scope, preview deltas, scheduled rollout status |

## Near-Term Reporting Pattern

MVP should use:

- Postgres views for operational reports;
- materialized views only when measured query cost requires them;
- indexes on `org_id`, timestamps, state, SKU/channel dimensions;
- API endpoints owned by services or a reporting facade through Gateway;
- no direct frontend SQL access.

## Event Export Path

To keep future analytics simple, every important event should include:

- `event_id`
- `org_id`
- `event_type`
- `actor_id`
- `entity_type`
- `entity_id`
- `occurred_at`
- protobuf payload
- schema version

Governance already stores these for audit. A later analytics exporter can write event batches to object storage without changing producers.

## When To Add Iceberg/Trino

Consider Iceberg/Trino when at least one of these becomes true:

- customers need cross-org aggregate analytics isolated from operational workloads;
- Postgres reporting queries start affecting product latency;
- event history grows beyond practical operational-query size;
- analysts need SQL over large append-only history;
- machine-learning or forecasting pipelines need versioned snapshots;
- customer data exports require large partitioned historical datasets.

## Future Lakehouse Shape

Potential future layout:

```text
s3://owomide-analytics/
  bronze/events/
  bronze/import_rows/
  silver/catalog_price_records/
  silver/catalog_cost_records/
  silver/proposal_events/
  gold/margin_by_sku_day/
  gold/import_quality_by_source/
```

Recommended partition keys:

- `org_id`
- event or record date
- service/entity type

## What Not To Do

- Do not use object storage as a shared Postgres volume.
- Do not let analytics write back to operational Catalog tables.
- Do not put messy raw import data directly into Catalog for reporting convenience.
- Do not expose cross-org data through BI tools without an explicit tenant-isolation design.
