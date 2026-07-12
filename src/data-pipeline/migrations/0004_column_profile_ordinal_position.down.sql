-- Rollback: 0004_column_profile_ordinal_position
-- Service: data_pipeline

ALTER TABLE data_pipeline.column_profile
    DROP CONSTRAINT IF EXISTS column_profile_unique_ordinal,
    DROP CONSTRAINT IF EXISTS column_profile_ordinal_position_check,
    DROP COLUMN IF EXISTS ordinal_position;
