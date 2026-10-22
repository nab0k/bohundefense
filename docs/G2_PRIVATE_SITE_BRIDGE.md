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
