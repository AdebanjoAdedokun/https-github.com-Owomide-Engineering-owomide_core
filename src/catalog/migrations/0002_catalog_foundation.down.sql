-- Rollback: 0002_catalog_foundation
-- Service: catalog
-- btree_gist is database-wide and may be shared by other services; do not drop it.
DROP SCHEMA IF EXISTS catalog CASCADE;
