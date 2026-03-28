-- 01-init-timescaledb.sql
-- Runs on first container startup to enable TimescaleDB extension.
-- Prisma migrations handle table creation; this script only sets up extensions.

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable pg_trgm for fuzzy text search (stock name search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'TimescaleDB and pg_trgm extensions initialized successfully';
END
$$;
