Create a new database migration for a service.

Usage: /new-migration <service-name> <description>

1. Run `make migrate-create svc=$ARGUMENTS` (once wired up) or manually create the migration file
2. Place it in `src/<service>/migrations/` with timestamp prefix
3. Write both UP and DOWN migrations
4. Ensure all customer-owned tables include `org_id`
5. Add appropriate indexes (org_id-scoped where applicable)
6. Use the service's own Postgres role for permissions

Before merging, invoke the schema-reviewer agent from `.claude/agents/schema-reviewer.md`.
