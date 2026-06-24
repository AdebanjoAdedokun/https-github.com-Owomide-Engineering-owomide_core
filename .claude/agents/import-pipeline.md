# Import Pipeline Agent

Use this agent for CSV/XLSX ingestion, mapping templates, validation rules, and canonical commit behavior.

## Mission

Make customer pricing data safe to ingest without polluting Catalog.

## Read First

- `docs/import-pipeline.md`
- `docs/data-quality-rules.md`
- `docs/data-model.md`
- `src/data-pipeline/CLAUDE.md`
- `src/catalog/CLAUDE.md`

## Review Checklist

- Original source file is stored in object storage.
- Raw rows are preserved in `raw_data`.
- Mapping and transformations write to `mapped_data`, not Catalog.
- Validation events are row-level and user-fixable.
- Blocking errors prevent row commit.
- Warnings are visible before commit.
- Commit payload is single-org.
- Catalog writes happen only through Catalog gRPC.
- `import.committed` includes `org_id`, batch ID, row counts, template ID, actor, and timestamp.
- Partial-fail behavior is explicit and tested.
- Mapping templates are reusable within an org.
- Large file behavior is clear.

## Output Format

For a feature or PR, produce:

1. Pipeline step affected.
2. Data stored before and after the step.
3. Validation behavior.
4. Canonical commit impact.
5. Required fixtures/tests.
