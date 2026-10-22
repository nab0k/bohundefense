# G2 private staged facts -> existing company profile

The G2 private data converter is delivered in the owner-local archive
`BOHUN_G2_private_claims_2026-10-22.zip`. It transforms a validated HOLD-only
manifest into exactly the same view-model contract already consumed by
`assets/atmo22/company.js` via the G1 localhost-only loader.

## Private route (unchanged on production)

Use `http://127.0.0.1:8765/company-profile.html?g1_candidate=25` with
an owner-local review server that serves private JSON from
`/__g1_review/25.json`. The other 19 IDs render source-only research
profiles with HOLD, not finished legal dossiers. No browser Supabase access
or write tokens. Nothing is published by this branch.

## Distinct identity & claim rules

- `Accurision GmbH` canonical `company_id` is preserved.
- Registered capital is not revenue; founded year, employee count and
  revenue remain unknown if not independently supported.
- Proposed taxonomy does not become an approved visible classification.
- Exhibitor-reported country must never be treated as legal country.
- Every displayed G2 claim has a primary source pointer; no original
  HTML bytes are yet archived and no legal-binding QA has been approved.
- The G2 database migration and writer are separately proposed in
  `nab0k/bohun-the-field` PR #90; neither migration nor writer has run.

## Gates

Before production: exact owner-approved migration, narrowly scoped HOLD-only
write/readback, complete visual browser QA, legal identity QA, and a separate
allowlisted publication export. Do not merge this PR to deploy the preview.


## G2 real-page browser QA (2026-10-22)

The G2 private preview now uses the actual `company-profile.html` renderer in both Workspace and Overview.
GitHub Actions `g2-private-browser-qa.yml` pins `ubuntu-24.04` and runs pinned Playwright 1.55.0 Chromium.
The test dynamically intercepts `/__g1_review/25.json` with **SYNTHETIC TEST DATA ONLY**; the fixture contains no live Supabase values, private source pack, credentials, or production export.
The output contains full-page screenshots (clearly marked SYNTHETIC), a JSON result and 7-day artifact retention.

Verified in CI (see https://github.com/nab0k/bohundefense/actions/runs/39858044783):
- Actual SITE HTML and modules load from the checked-out branch, with no JS page exceptions.
- Workspace: three TEST products, two proposed technologies, 23 synthetic evidence rows, revenue unknown, separate registered-capital fact, disabled Financials tab.
- Overview: same three products, two proposed taxonomy labels with codes visible, 23 evidence rows, capital separate from revenue.
- `HOLD` warning stays in page flow rather than obscuring panels.
- No default public release or direct browser-to-Supabase access.

**Not yet proved:** live privileged PostgreSQL reader run with a read-only DSN, G2 production fact payload rendered end-to-end, real Accurision screenshots, original-source archiving, and human QA. The actual G2 private model remains in the owner's local package, outside the public repo.

Existing `p0-pages-smoke.yml` was moved from `ubuntu-latest` (Ubuntu 26.04 unsupported by pinned Playwright) to `ubuntu-24.04`. Its unrelated pre-existing check now fails on its legacy `m1-mobile-menu` DOM assumption. This is not a G2 renderer failure; do not bypass the assertion without reviewing P0 scope.
