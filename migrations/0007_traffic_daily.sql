-- Daily traffic split for requests that reach Pages Functions (homepage, /mcp, /a2a, /api/*).
-- One row per (UTC day, route, client class); the middleware buffers counts in memory and upserts them in small batches,
-- so a traffic spike costs a handful of D1 writes, not one per request. No IPs, user agents or other personal data are stored.
CREATE TABLE IF NOT EXISTS traffic_daily (
  day TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
  route TEXT NOT NULL,    -- home | mcp | a2a | api | commerce | other
  client TEXT NOT NULL,   -- browser | headless | ai_crawler | ai_agent | search_bot | social_bot | monitor | script | self | unknown
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route, client)
) WITHOUT ROWID;
