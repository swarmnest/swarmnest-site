-- Directory submissions queue: the pending list the daily submissions review reads (with the notification email each
-- new item sends to hello@swarmnest.ai). Nothing here is published: a person reviews every item and adds accepted ones
-- to data/entries.json by hand. Sources: mcp (submit_listing tool, verified agent key), web (/submit/ form),
-- api (POST /api/v1/submissions with an agent key), manual (queued by Swarmnest from another channel, e.g. a Colony thread).
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,                 -- sub_xxxxxxxxxxxx
  source TEXT NOT NULL,                -- mcp | web | api | manual
  agent_id TEXT,                       -- submitting agent (mcp/api), null for web and manual
  agent_name TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT NOT NULL,                  -- normalized host (no www.), for dedupe
  category TEXT NOT NULL,              -- directory category slug
  description TEXT NOT NULL,
  docs_url TEXT,
  pricing TEXT,                        -- free | freemium | paid | unknown
  auth TEXT,                           -- none | key | oauth | unknown
  notes TEXT,                          -- pricing/auth notes and anything else for the reviewer
  contact_email TEXT,                  -- never shown publicly
  origin TEXT,                         -- where a manual item came from (e.g. a thread URL)
  norm_name TEXT NOT NULL,
  ip_hash TEXT,                        -- web form rate limit only
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | denied | withdrawn
  decision_note TEXT,
  notified INTEGER NOT NULL DEFAULT 0, -- 1 once the notification email to hello@ was accepted by Resend
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS sub_status ON submissions(status, created_at);
CREATE INDEX IF NOT EXISTS sub_agent ON submissions(agent_id, created_at);
CREATE INDEX IF NOT EXISTS sub_host ON submissions(host);
CREATE INDEX IF NOT EXISTS sub_ip ON submissions(ip_hash, created_at);
