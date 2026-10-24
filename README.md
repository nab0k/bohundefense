# BOHUN Company Sync — code staged in GitHub review branch

**Date:** 2026-10-23. **Repository:** `nab0k/bohundefense`, review branch `fix/notion-companies-hourly-20261023`.

The code has been pushed to a **review branch**, not deployed to the live website. The private SQL migration was applied to Supabase on 2026-10-23 and both new tables were verified empty with RLS enabled and no anon/authenticated read or write grants. **12 offline tests pass**; no live Notion API integration, PostgreSQL data write or GitHub Pages publication has been performed.

## Why the existing script alone was not enough

The existing `scripts/build-company-publication.py` builds static files from a manually provided Notion snapshot. The website reads `atlas/companies-directory-v1.json` (`/assets/atmo22/data.js`) and separately uses `atlas/company-country-groups.geojson`. As of the read-only review on 2026-10-23, the existing public directory contained **743** rows, while the Notion `DB | Companies (all countries)` source had **3,480** rows and the private Supabase `companies.company` table contained **3,429** non-null `notion_page_id` references among **3,751** company entities. These are different datasets and their counts should not be expected to be equal.

Source: `collection://ec8c6312-3bfc-48e8-9a27-3c5827e72fda` in Notion; target Supabase project `tecrucawzukxqtchpxrh` (`bohundefence-intelligence`). Confirm identifiers against the live configuration before implementing.

## Files to integrate into the website repository

* `scripts/sync-notion-companies.py` (new): fetches **every** Notion page and **all** of its typed database properties (including multi-item property pagination when necessary), checks live schema coverage, and retries transient API failures, performs source-count/ID safety checks, writes only to a new **private source cache** in Supabase and emits an ephemeral build input under `$RUNNER_TEMP`. It does **not** overwrite canonical `companies.company` identities or auto-merge companies by name.
* `db/002_notion_company_cache.sql` (new): creates `companies.notion_company_cache` and `companies.notion_sync_run` with RLS and revoked public access. **Applied to the designated Supabase project with owner authorization on 2026-10-23.**
* `scripts/build-company-publication.py` (**replacement**): rebuilds the public research directory and country centroid groups from the live source cache output plus the two historical published inputs; keeps the previously agreed research-index statuses and prevents re-import of excluded Notion records from legacy datasets.
* `scripts/validate-company-publication.py` (new): refuses to release malformed/unsafe JSON or a sudden >25% drop in directory rows.
* `scripts/verify-live-companies.py` (new): confirms the CDN serves the exact published directory checksum.
* `.github/workflows/notion-company-hourly.yml` (new): hourly GitHub Actions workflow at minute 13 UTC, with dry tests, Notion extraction, transactional PostgreSQL cache with full-payload read-back, public build, validation, changed-files-only commit, explicit GitHub Pages deployment, and CDN read-back.
* `tests/test_company_sync.py` (new): 12 isolated unit tests (no live credentials).

## Editorial and privacy rules

The website remains a **labelled public research index**, not a verified supplier database. The rule from the existing `D-20261021-PUBLISH-ALL-COMPANIES` publisher is retained: a company needs `country` and at least one of city/website/category/about. Records marked `Review status = excluded` or `Sanctions = hit`, and records from RU/CN/BY, are omitted. `research_publishable` requires both Notion `Publishable = true` **and** `Review status = accepted`; other eligible entries are explicitly labelled `unverified_candidate`. Blank or unreconciled candidate records remain in the **private** cache even if not publicly publishable. Ukraine `city` is redacted rather than treated as facility location. No raw Notion document payload, internal audit notes, secrets, or private source export are committed to the website.

**Limitation:** This patch updates the directory and **country grouping map layer**. It does **not** geocode cities or refresh the pre-existing `atlas/notion-research-map.geojson` individual city points (88 in the current source). It refuses publication if an excluded Notion row is still present in that point layer. Independent map-point synchronization is a separate task and must not invent facility coordinates.

## External prerequisites, not yet fulfilled

1. **Completed 2026-10-23:** SQL migration applied; two empty private tables verified, RLS enabled, and anon/authenticated grants absent.
2. Create a **read-only Notion integration** shared with `DB | Companies (all countries)`, or reuse an existing integration with explicit access. Add its integration token to the website GitHub repo's **Actions secret** `BOHUN_NOTION_TOKEN`. ChatGPT's Notion connector authorization is not itself an API token that GitHub Actions can reuse.
3. Add GitHub Actions secret `BOHUN_SUPABASE_DB_URL`, using an appropriate **Session pooler** PostgreSQL connection string with SSL for `tecrucawzukxqtchpxrh`. Do not put any database password in workflow YAML or a git commit.
4. GitHub Pages must be configured to **publish using GitHub Actions**, not only build from a branch. GitHub explicitly documents that commits pushed with `GITHUB_TOKEN` do not trigger a Pages build. The workflow therefore includes `actions/upload-pages-artifact` + `actions/deploy-pages`; a separate authorized Pages source configuration change may be necessary.
5. **The workflow has a main-branch-only job guard: dispatching it on a review branch cannot touch the database or live site. Do not merge the scheduled workflow yet** without separate release authorization. Proposed rollout: first review the code and migration; test one manual run under an explicitly approved release window; inspect DB read-back and public JSON diff; only then enable hourly schedule.

## Verification and acceptance plan

1. `python -m unittest discover -s tests -p 'test_company_sync.py' -v` (offline tests; currently 12/12 pass).
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

**Deployment boundary:** The approved private SQL migration is complete and code is on a review branch. The `main` branch, GitHub Pages configuration and public files remain unchanged. The workflow cannot run in production until GitHub Actions secrets and Pages publishing source are configured and the reviewed workflow is merged to `main`.

## All-field completeness guarantee (2026-10-23 update)

Every **Notion database column** is retained as its original typed Notion API property under `notion_page.properties` inside `companies.notion_company_cache.payload`. Page metadata also remains available there. The private table is not exposed via public API, and `notion_page` is never added to the website JSON.

A source schema fetch checks that each query result includes every current database column. For list-valued rich text/title/relation/people properties with 25+ items, the script requests the paginated page-property endpoint and preserves all property-item responses; incomplete rollups also trigger a full request. Once written, it reads all saved JSONB payloads back and verifies each field via a canonical SHA-256, as well as count/IDs, in the same transaction. Mismatches abort the transaction and block publishing.

Scope: **database columns and page metadata**, not body blocks, discussions or attachments stored on separate pages. Public directory fields continue to follow the existing BOHUN publication policy. The migration already applied on 2026-10-23 uses JSONB and does not require new DDL to handle these additional properties.
## 2026-10-24 activation gate and manual setup

The hourly publication job is intentionally **disabled by default**. It runs only from `main` when the repository Actions configuration variable `BOHUN_COMPANIES_SYNC_ENABLED` is exactly `true`. PRs run offline tests only, without Notion/DB secrets and without publication. This prevents repeated failed production jobs before access setup.

Before enabling it:

1. In GitHub repository **Settings → Secrets and variables → Actions → Secrets**, add or confirm `BOHUN_NOTION_TOKEN`, a read-only Notion integration token with access to source data source `ec8c6312-3bfc-48e8-9a27-3c5827e72fda`.
2. In the same location, add or confirm `BOHUN_SUPABASE_DB_URL`, a PostgreSQL SSL session-pooler connection URL for project `tecrucawzukxqtchpxrh`, with access restricted to the private cache and run tables. Never send the URL/password in chat or commit it.
3. In GitHub **Settings → Pages → Build and deployment**, confirm **Source: GitHub Actions**. Changing the current Pages source should be coordinated with the existing production release workflow so it does not interrupt the site.
4. Validate a **single** real Notion API read and private DB write/read-back with production credentials in a controlled run; inspect exclusions, catalogue diff, and browser smoke tests before enabling public auto-release.
5. Only then, in **Settings → Secrets and variables → Actions → Variables**, add repository variable `BOHUN_COMPANIES_SYNC_ENABLED` set to `true`. The scheduler then runs at minute 13 every UTC hour; keep the variable unset/false to disable without code changes.

The GitHub connector available in this chat cannot inspect or create repository Actions secrets/variables, change Pages source settings, or dispatch a workflow. No step here confirms these settings already exist. New private Supabase tables have been created and verified empty; the live Notion extraction has not happened.
