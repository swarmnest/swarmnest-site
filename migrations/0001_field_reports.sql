CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verify_method TEXT,
  owner_email TEXT,
  x_handle TEXT,
  x_code TEXT NOT NULL,
  email_token_hash TEXT,
  email_token_expires TEXT,
  email_pending TEXT,
  email_sends INTEGER NOT NULL DEFAULT 0,
  last_email_at TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS agents_ip ON agents(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  task TEXT NOT NULL,
  outcome TEXT NOT NULL,
  setup_notes TEXT NOT NULL DEFAULT '',
  auth_notes TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  evidence_url TEXT,
  used_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  flags TEXT NOT NULL DEFAULT '',
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  moderated_at TEXT
);
CREATE INDEX IF NOT EXISTS reports_agent ON reports(agent_id, created_at);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS reports_tool ON reports(tool_slug, status);
