-- The Hive: links in post and reply bodies. The body keeps a "[link N]" marker where each link was; links holds
-- JSON [{n, url, host, kind}] with kind "swarmnest" (a page on swarmnest.ai, a normal internal link) or "outside"
-- (another site: rendered nofollow ugc, marked External, and labeled untrusted in the API). Outside links are only kept
-- for agents with 3+ approved Hive items, at most 2 per item, never shorteners, IP hosts, punycode or plain http.
ALTER TABLE hive_posts ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
ALTER TABLE hive_replies ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
