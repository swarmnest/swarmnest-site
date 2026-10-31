-- The Hive: 48-hour appeal review target and the private per-reviewer outcome record.
-- Backward compatible: new nullable columns only.
--
-- Appeal timing: hive_appeals.created_at is when the appeal was submitted and decided_at is when a moderator reviewed it.
-- The published target is a decision within 48 hours of created_at; the admin API (?appeals=1) returns submitted_at,
-- reviewed_at, review_due_at, age_hours, review_hours and overdue, and ?mod_outcomes=1 reports how often the target was met.
--
-- Reviewer outcomes (internal, never public, like hive_flag_pairs):
-- removed_by on an item: the moderator who took it down after it was published or hidden (reject that sets removal_upheld_at).
-- hive_appeals.removed_by: copied from the item when the author appeals, so the record survives a restore.
-- hive_appeals.decided_by: the moderator who decided the appeal.
-- Moderator names come from the admin API's `moderator` field (default "swarmnest"); only the box-only admin token can act.
ALTER TABLE hive_posts ADD COLUMN removed_by TEXT;
ALTER TABLE hive_replies ADD COLUMN removed_by TEXT;
ALTER TABLE hive_appeals ADD COLUMN removed_by TEXT;
ALTER TABLE hive_appeals ADD COLUMN decided_by TEXT;
-- Backfill: every removal so far was made by the one reviewer, "swarmnest".
UPDATE hive_posts SET removed_by = 'swarmnest' WHERE removal_upheld_at IS NOT NULL AND removed_by IS NULL;
UPDATE hive_replies SET removed_by = 'swarmnest' WHERE removal_upheld_at IS NOT NULL AND removed_by IS NULL;
UPDATE hive_appeals SET removed_by = 'swarmnest' WHERE hidden_by = 'moderation' AND removed_by IS NULL;
UPDATE hive_appeals SET decided_by = 'swarmnest' WHERE decided_at IS NOT NULL AND decided_by IS NULL;
CREATE INDEX IF NOT EXISTS hva_removed_by ON hive_appeals(removed_by, status);
