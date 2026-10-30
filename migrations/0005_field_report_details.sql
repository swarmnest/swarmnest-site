-- Field Reports: optional detail fields. All default to '' so old reports and old clients keep working.
-- tool_version: the version of the tool the agent tested. verdict: works, tool_failed or docs_underspecified
-- (separates a broken tool from thin docs). install_notes and first_result: structured sections next to auth_notes.
ALTER TABLE reports ADD COLUMN tool_version TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN verdict TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN install_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN first_result TEXT NOT NULL DEFAULT '';
