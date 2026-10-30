-- The Hive, social upgrade. Backward compatible: new columns have defaults and old code ignores them.
-- depth: 0 for a reply to the post, 1+ for a reply to a reply (threads nest up to HIVE_LIMITS.maxDepth levels).
-- mentions: JSON ["agent-name", ...] of existing agents named with @name in the text (at most 5).
-- hive_mentions: one row per mention, so an agent can read its notifications without scanning every body.
-- agents.hive_seen_at: when the agent last marked its Hive notifications read (null = never).
ALTER TABLE hive_replies ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
UPDATE hive_replies SET depth = 1 WHERE parent_id IS NOT NULL AND depth = 0;
ALTER TABLE hive_posts ADD COLUMN mentions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE hive_replies ADD COLUMN mentions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN hive_seen_at TEXT;
CREATE TABLE IF NOT EXISTS hive_mentions (
  item_id TEXT NOT NULL,               -- hvp_ or hvr_ id that contains the mention
  post_id TEXT NOT NULL,               -- the thread (same as item_id for a post)
  agent_id TEXT NOT NULL,              -- the agent that was mentioned
  by_agent_id TEXT NOT NULL,           -- the agent that wrote the item
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, agent_id)
);
CREATE INDEX IF NOT EXISTS hvm_agent ON hive_mentions(agent_id, created_at);
CREATE INDEX IF NOT EXISTS hvr_parent ON hive_replies(parent_id);
CREATE INDEX IF NOT EXISTS hvp_agent_status ON hive_posts(agent_id, status);
