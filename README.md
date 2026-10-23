# BOHUN Company Sync — proposed offline-tested patch

**Date:** 2026-10-23. **Target repository:** `nab0k/bohundefense` (`main`).

This is a **prepared change package**, not a live deployment. No changes were pushed to GitHub, Notion, Supabase, or the public site during its preparation. The seven offline unit tests pass; there has been **no live integration test** of the external Notion API, PostgreSQL write credentials, Pages deployment, or the public CDN.

## Why the existing script alone was not enough

The existing `scripts/build-company-publication.py` builds static files from a manually provided Notion snapshot. The website reads `atlas/companies-directory-v1.json` (`/assets/atmo22/data.js`) and separately uses `atlas/company-country-groups.geojson`. As of the read-only review on 2026-10-23, the existing public directory contained **743** rows, while the Notion `DB | Companies (all countries)` source had **3,480** rows and the private Supabase `companies.company` table contained **3,429** non-null `notion_page_id` references among **3,751** company entities. These are different datasets and their counts should not be expected to be equal.

Source: `collection://ec8c6312-3bfc-48e8-9a27-3c5827e72fda` in Notion; target Supabase project `tecrucawzukxqtchpxrh` (`bohundefence-intelligence`). Confirm identifiers against the live configuration before implementing.

## Files to integrate into the website repository

* `scripts/sync-notion-companies.py` (new): fetches **every** Notion page with API pagination and backoff, performs source-count/ID safety checks, writes only to a new **private source cache** in Supabase and emits an ephemeral build input under `$RUNNER_TEMP`. It does **not** overwrite canonical `companies.company` identities or auto-merge companies by name.
* `db/002_notion_company_cache.sql` (new): creates `companies.notion_company_cache` and `companies.notion_sync_run` with RLS and revoked public access. **Only execute after separate database-change approval.**
* `scripts/build-company-publication.py` (**replacement**): rebuilds the public research directory and country centroid groups from the live source cache output plus the two historical published inputs; keeps the previously agreed research-index statuses and prevents re-import of excluded Notion records from legacy datasets.
* `scripts/validate-company-publication.py` (new): refuses to release malformed/unsafe JSON or a sudden >25% drop in directory rows.
* `scripts/verify-live-companies.py` (new): confirms the CDN serves the exact published directory checksum.
* `.github/workflows/notion-company-hourly.yml` (new): hourly GitHub Actions workflow at minute 13 UTC, with dry tests, Notion extraction, transactional PostgreSQL cache, public build, validation, changed-files-only commit, explicit GitHub Pages deployment, and CDN read-back.
* `tests/test_company_sync.py` (new): seven isolated unit tests (no live credentials).

## Editorial and privacy rules

The website remains a **labelled public research index**, not a verified supplier database. The rule from the existing `D-20261021-PUBLISH-ALL-COMPANIES` publisher is retained: a company needs `country` and at least one of city/website/category/about. Records marked `Review status = excluded` or `Sanctions = hit`, and records from RU/CN/BY, are omitted. `research_publishable` requires both Notion `Publishable = true` **and** `Review status = accepted`; other eligible entries are explicitly labelled `unverified_candidate`. Blank or unreconciled candidate records remain in the **private** cache even if not publicly publishable. Ukraine `city` is redacted rather than treated as facility location. No raw Notion document payload, internal audit notes, secrets, or private source export are committed to the website.

**Limitation:** This patch updates the directory and **country grouping map layer**. It does **not** geocode cities or refresh the pre-existing `atlas/notion-research-map.geojson` individual city points (88 in the current source). It refuses publication if an excluded Notion row is still present in that point layer. Independent map-point synchronization is a separate task and must not invent facility coordinates.

## External prerequisites, not yet fulfilled

1. **Review and approve** a schema migration in the existing Supabase project. Use the SQL file in `db/`, then confirm the two private tables exist and cannot be read through the anon Data API.
2. Create a **read-only Notion integration** shared with `DB | Companies (all countries)`, or reuse an existing integration with explicit access. Add its integration token to the website GitHub repo's **Actions secret** `BOHUN_NOTION_TOKEN`. ChatGPT's Notion connector authorization is not itself an API token that GitHub Actions can reuse.
3. Add GitHub Actions secret `BOHUN_SUPABASE_DB_URL`, using an appropriate **Session pooler** PostgreSQL connection string with SSL for `tecrucawzukxqtchpxrh`. Do not put any database password in workflow YAML or a git commit.
4. GitHub Pages must be configured to **publish using GitHub Actions**, not only build from a branch. GitHub explicitly documents that commits pushed with `GITHUB_TOKEN` do not trigger a Pages build. The workflow therefore includes `actions/upload-pages-artifact` + `actions/deploy-pages`; a separate authorized Pages source configuration change may be necessary.
5. **The workflow has a main-branch-only job guard: dispatching it on a review branch cannot touch the database or live site. Do not merge the scheduled workflow yet** without separate release authorization. Proposed rollout: first review the code and migration; test one manual run under an explicitly approved release window; inspect DB read-back and public JSON diff; only then enable hourly schedule.

## Verification and acceptance plan

1. `python -m unittest discover -s tests -p 'test_company_sync.py' -v` (offline tests; currently 7/7 pass).
2. Compare Notion source count, UUID uniqueness, filtered records and source digest. Current read-only baseline: `3,480` Notion rows, `34` explicitly publishable, `60` accepted, `35` excluded, and about `1,186` with country and an additional information field under the basic research-index filter. The final public row count may be higher because the builder preserves historical published datasets.
3. Verify the new cache has exactly the source count, and `companies.company` status/category/identity fields were **not** overwritten by name-based matching.
4. Ensure JSON schema `bohun-companies-directory-v1` and old site data consumers remain compatible. Before release, perform at least one browser smoke test of Companies, a company profile, and the map on desktop/mobile (not yet performed).
5. Test one Notion edit, one Notion addition, one explicit exclusion and one unchanged run; ensure appropriate diff/no-op. Test a Notion API failure and verify the previous site remains untouched.
6. After explicit deployment, compare the live JSON SHA-256 to the generated version, verify a functional company profile, and retain previous Git commit as rollback point.

## Run without external writes

The normal no-secrets code test is:

```sh
python -m unittest discover -s tests -p 'test_company_sync.py' -v
```

The extractor also supports a **synthetic** fixture and a dry-run; never check actual raw Notion exports into Git:

```sh
python scripts/sync-notion-companies.py --fixture /tmp/notion-fixture.json \
    --min-records 1 --dry-run --output /tmp/notion-ephemeral.json
```

## Risks / open questions

* GitHub Actions scheduled runs can be delayed; minute 13 every hour is best-effort, not guaranteed to run at the exact second.
* Database network connectivity from GitHub's hosted runner and the Notion integration permission must be confirmed in a controlled live smoke test.
* The original `scripts/build-company-publication.py` is deliberately replaced, so verify the code diff against GitHub `main` and do an end-to-end build with the **real** `atlas/` files before merge; the tests used synthetic fixtures only.
* Existing sources `atlas/notion-companies-public-research.json` and `atlas/notion-research-map.geojson` are historical files and are **not** rewritten by this patch. If any live consumer still uses those files, inspect that specific consumer before making a public freshness claim.
* Additional management capabilities (alerts on repeated failures, 24-hour latency metrics, publish audit dashboards) are valuable follow-up improvements but not prerequisites for the minimal hourly flow.

**Approval boundary:** This package is code preparation only. The live DB migration, GitHub commit/push, Pages configuration and any publication each require explicit approval under BOHUN project rules.
