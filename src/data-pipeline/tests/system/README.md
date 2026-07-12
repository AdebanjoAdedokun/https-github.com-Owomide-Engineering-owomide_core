# Data Pipeline System Acceptance

This suite validates the Phase 2 exit path against real service processes and infrastructure:

```text
Gateway -> Data Pipeline -> MinIO/PostgreSQL -> Catalog -> Kafka
```

It deliberately stays within the MVP source contract: UTF-8 CSV and XLSX. JSON, XML, SFTP,
and connector feeds remain future formats.

## Scenarios

| Scenario | Shape | Expected result |
|---|---|---|
| Retail history | CSV with reordered customer headers and two effective dates | Two validated rows commit; Catalog returns the correct price and cost at each effective date. |
| Regional identifier pricing | XLSX with typed identifiers, UUID dimensions, native date/numeric cells, and a non-default currency | Validation warns; commit is blocked without confirmation and succeeds with confirmation. |
| Invalid customer rows | CSV with missing identity, malformed money/date, invalid currency, and unknown channel | Actionable validation codes are returned; no Catalog write occurs. |

The suite also verifies worker restart recovery, source provenance, cross-tenant isolation, Kafka
payloads and keys, duplicate commit protection, source object durability, and Catalog write
idempotency records.

Run from the repository root:

```bash
make data-pipeline-acceptance-test
```

Docker is required. The runner creates an isolated network and ephemeral Postgres, MinIO, Kafka,
Catalog, Data Pipeline, and Gateway containers. Containers and test-tagged images are removed on
exit unless `--keep-images` is passed directly to `acceptance.py`.
