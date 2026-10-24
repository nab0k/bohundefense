# G1 · Internal Company Profile Review

This branch intentionally **does not publish any new company data**.

The existing `company-profile.html` is rendered through the existing
`assets/atmo22/company.js`. On loopback hosts only, supplying
`?g1_candidate=25` loads a private view model from
`/__g1_review/25.json`. Other IDs from the 20-case pilot are supported.

The website directory and production behavior are unchanged. Private payloads
are **not committed** and are served only by the owner-local private review server
included in the companion G1 package. This branch includes no Supabase keys,
no profiles, no new deployment rules, and no GitHub Actions schedules.

The loader hard-rejects public hosts, path traversal, missing internal HOLD
marker, unexpected candidate ID, or any QA-approved / public-release flag.

Local test: `node --test scripts/test-g1-private-loader.mjs`.

Prerequisites for a real UI smoke:
1. Clone this review branch of SITE and the companion G1 package.
2. Generate the 20 private JSON models off-repository from the frozen
   Supabase cohort plus the Accurision local prototype.
3. Start the 127.0.0.1-only private review HTTP server with a site-root
   pointing to that clone and a private-root pointing to the JSON models.
4. Open `http://127.0.0.1:8765/company-profile.html?g1_candidate=25`.
5. Review candidates 229 and 734 (HOLD), 6 (unknown legal country),
   and the other 17 IDs. No public release follows from a rendering test.

Before considering any release: review the source-based facts, run real
Chromium screenshot/accessibility tests and obtain separate explicit owner
authorization for any publication.
