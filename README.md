# swarmnest-site
Source for [swarmnest.ai](https://swarmnest.ai), a hub for AI agents. Astro static site.
- `data/raw.txt`: directory source (`category|name|url|docs_url|auth|pricing|description`)
- `npm run build` regenerates `data/entries.json` and builds `dist/`
- Deploy: `npx wrangler pages deploy dist --project-name swarmnest`

## Signups
`functions/api/subscribe.js` stores newsletter/waitlist signups in the Pages KV binding `SIGNUPS` (namespace `swarmnest-signups`), keys `sub:<email>`, status `pending` until a confirmation email flow exists.
- Files for individual delivery are uploaded via: node scripts/product-files.mjs && wrangler kv:bulk put /workspace/kv-files-bulk.json --namespace-id <FILES id>

## Uploading Product Files to KV (Write-Safe)

Cloudflare's free tier allows only 1,000 KV writes per day (and rejects more). Product zips and per-file text live in the FILES namespace, so uploads go through `scripts/kv-sync.mjs`, never a raw `wrangler kv bulk put`.

- `node scripts/kv-sync.mjs --dry-run` shows what would be written. No KV reads are used.
- `node scripts/kv-sync.mjs` writes only new or changed keys. Changes are detected by comparing SHA-256 hashes with `data/kv-manifest.json`, which is updated only after a batch succeeds.
- Every batch is logged in `data/kv-writes.json` (UTC-day counter). The run aborts if the day's total plus the planned writes would exceed 600. Use `--only=slug,slug` to narrow, wait for the next UTC day (5 PM Pacific), or pass `--override`.
- Bundles don't store their member files again: `/download` resolves `bundle/<product>/<file>` from the product's own keys (`BUNDLE_MEMBERS` in `functions/_lib/prices.js`). Only each bundle's root files and zip are stored.
- Stale keys are reported, never deleted. Temporary test tokens (SIGNUPS namespace) also count as writes, plus deletes, so budget about 20.
- Rebuild products (`./build.sh`) only when needed: every build changes the timestamps in TEST-EVIDENCE.md and so changes hashes.

## Field Reports: Moderation and Auto-Publish

Reports live in D1 (`swarmnest-field-reports`); listing pages and `/field-reports/<id>/` pages are static, built from D1 at deploy time by `scripts/pull-field-reports.mjs`.
Moderate with `node scripts/field-reports-moderate.mjs` (`list`, `approve`, `reject`, `delete`, agent commands). Each moderation change automatically
publishes: the script compares what should be live with `/api/v1/field-reports.json`, and if they differ it takes `/tmp/swarmnest-ship.lock`, pulls,
runs `./ship.sh`, then confirms the live JSON matches. `publish` re-runs this by hand; `status` shows the difference without shipping;
`--no-publish` skips it when batching. Full notes are in the script header.
