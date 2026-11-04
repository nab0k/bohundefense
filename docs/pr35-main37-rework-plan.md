# PR #35 backend rework after merged PR #37

Status: DRAFT ONLY. No deploy, migration, mail activation, form switch or merge authorized.

## Source of truth
- Branch based on fresh `main` after PR #37.
- Keep `contact.html`, `services.html`, `about.html`, `index.html`, site shell, services cards and Formspree unchanged.
- Existing Formspree form remains the production intake. This branch carries only isolated server/SQL drafts and tests, not a frontend replacement.

## Required work before staging
1. Align server payload with actual `contact.html`: `topic`, `name`, `organisation`, `email`, `message`, `_gotcha`. Map topic to a controlled category server-side; preserve context fields only when explicitly provided. No silent form change.
2. Introduce a client-generated idempotency key with a unique DB constraint; retries must return the original accepted result and never create a second enquiry. Distinguish DB deduplication from Resend delivery idempotency.
3. Audit trusted client IP headers; add durable rate limiting and Turnstile widget + server-side validation. No bypass for absent identity or verification.
4. Verify restricted grants for `bohun_private`, separate least-privilege roles for intake and notification worker, and ensure no public/anon/authenticated table or RPC access.
5. Verify atomic queue claims, lease expiry and retry behavior; use Resend idempotency support where available, and reconcile uncertain delivery outcomes without silently double-sending.
6. Review privacy notice, consent/acknowledgement and retention policy before collecting live data.
7. Add integration tests against disposable staging database, mocked spam verification and Resend; then authorized end-to-end tests with staging keys. Test duplicate submits, concurrent retries, 429s, failed notifications, lease recovery, unauthorized access.
8. Prepare explicit cutover and rollback instructions. Formspree remains active until owner separately approves a reversible switch.

## Proposed database objects
- `bohun_private.business_inquiries`: enquiry and notification state, unique idempotency key.
- Private durable rate-limit records/function (review existing `docs/business-inquiries-access-and-rate-limit.sql`).
- Private atomic notification claim/finish/reconcile functions; no additional queue table unless testing demonstrates a need.

## Secrets / config
- `INQUIRY_INTAKE_DATABASE_URL` (restricted DB user), `INQUIRY_RATE_HMAC_KEY`, `TURNSTILE_SECRET_KEY`.
- `RESEND_API_KEY`, `INQUIRY_NOTIFICATION_TO`, notification-worker authentication secret and staging sender.
- Public Turnstile site key is not a secret. `INQUIRY_INTAKE_ENABLED` must remain false.

## Permissions
- Code-only edits and CI now.
- Explicit authorization needed before staging migrations, real test sends, secret configuration, any deployment, PR merge, or production Formspree switch.

## Current caveat
Ported SQL and Edge Functions are **unreviewed legacy drafts**, not production-ready. Existing test script was ported but has not been run against this new branch.
