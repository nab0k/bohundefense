-- BOHUN company sync: private source cache, not an identity auto-merge.
-- Requires separate authorization to execute on live Supabase.
CREATE TABLE IF NOT EXISTS companies.notion_company_cache (
  notion_page_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  notion_edited_at timestamptz,
  last_seen_run uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notion_company_cache_active_idx
  ON companies.notion_company_cache (active);
CREATE TABLE IF NOT EXISTS companies.notion_sync_run (
  run_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  source_count integer NOT NULL CHECK (source_count >= 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('running', 'ok', 'error'))
);
ALTER TABLE companies.notion_company_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies.notion_sync_run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON companies.notion_company_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON companies.notion_sync_run FROM PUBLIC, anon, authenticated;
