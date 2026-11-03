# BOHUN enquiries: server-side rollout checklist

Status: staged code only. Not deployed or tested. Recipient: `nabok@bohundefence.com`.

## Design
Browser -> Supabase Edge Function `business-inquiries` -> private `bohun_private.business_inquiries` -> authenticated notification worker -> verified mail provider -> corporate mailbox.

The function in `supabase/functions/business-inquiries/index.ts` performs strict origin/method/type checks, field validation, Cloudflare Turnstile verification (fails closed), and save-first insertion. It returns a receipt only after durable insertion. **Do not deploy yet**: it depends on a non-public schema access configuration, Turnstile, a verified email sender, rate limiting and notification worker.

## Deployment gates
1. Confirm BOHUN domain and privacy retention policy; add processing notice and consent language as needed.
2. Approve and apply reviewed SQL migration. Keep private schema inaccessible to browser roles; verify with anon/authenticated negative tests.
3. Choose secure DB access path: private schema via service-role REST with restricted exposed-schema settings, or a locked-down RPC. Review project-wide Data API configuration before changing exposed schemas.
4. Provision Turnstile site/secret and secure Edge Function secrets. The client widget is NOT yet wired.
5. Add durable per-IP or per-session rate limiting with a trusted reverse proxy, plus monitoring and alerting; CORS and Turnstile alone are not rate limiting.
6. Set up verified sender domain and provider API key; implement authenticated queue worker with retries, idempotency and notification status updates. Never expose mail API key in the browser.
7. Add front-end endpoint configuration, Turnstile widget and accessible success/error states. Remove disabled submit only after end-to-end tests.
8. Test valid/invalid submissions, bot challenge failure, rate limit, DB outage, mail outage, retry, mobile layout and no public read of submissions.
9. Review PR and obtain separate publication approval.

No email, database schema change or production deployment has been performed.


## Frontend integration staged

`assets/inquiries.js` now has a real asynchronous POST handler and Turnstile challenge integration. **Submission remains disabled by default.** It is enabled only when `window.BOHUN_INQUIRY_CONFIG` explicitly contains `{enabled:true, endpoint:"https://<approved-edge-function>", turnstileSiteKey:"<public-site-key>"}` before `inquiries.js` loads, and the Turnstile client is available. Do not set `enabled:true` until the database, API, rate limiting, queue, Resend sender and privacy review are complete. The public Turnstile site key is not a secret; its secret verification key must stay server-side. No live config file is committed.

The submit button stays disabled in committed HTML and the client fails closed when config is missing. Test successful receipt, timeout ambiguity, missing challenge, validation, accessibility and reset behavior before release. A successful POST means the row was stored, **not** that email delivery succeeded.

Resend domain verification and API key creation have been reported by the owner; the key has **not** been transferred to Supabase secrets, and no sending-domain or provider API status has been independently checked.


## Implementation update (draft branch, 2026-11-03)

- Both Edge Functions now use a server-only `DATABASE_URL` connection to PostgreSQL and the non-exposed `bohun_private` schema. No REST schema exposure is required.
- The notification worker calls `bohun_private.claim_inquiry_notifications` and `bohun_private.finish_inquiry_notification` from the review-only queue SQL. The queue migration has NOT been applied.
- Both functions remain disabled by default: `INQUIRY_INTAKE_ENABLED=true` and `INQUIRY_NOTIFICATION_WORKER_ENABLED=true` are separate explicit server-side gates. Do not enable either before tests and approvals.
- `DATABASE_URL` must be provisioned only as an Edge Function secret, using a restricted database role. That role should have USAGE on `bohun_private`, INSERT and narrowly scoped SELECT on the enquiry table for intake, and EXECUTE on the queue functions for the worker. Prefer separate intake and worker database roles/connection secrets before production; the current shared `DATABASE_URL` is a staging simplification, NOT a least-privilege production setup.
- Critical outstanding work: durable rate limiting with trusted client-IP handling, restricted database roles and SQL grants, Turnstile client widget and keys, Resend verified sender and secrets, privacy/retention, negative permission tests, concurrency tests, and real end-to-end tests.
- A 2-minute lease plus Resend idempotency reduces duplicate delivery but does not guarantee exactly-once notifications. Verify behavior on timeout and lease expiry.
- No database migration, function deployment, mail send, merge or publication has occurred.

## Security implementation checkpoint

Staged SQL: `docs/business-inquiries-access-and-rate-limit.sql`. It creates NOLOGIN capability roles, RLS policies and an atomic hourly counter. **Not applied**. The SQL is a review draft: role creation and policy creation are not idempotent, role ownership and grants need testing, and the SECURITY DEFINER rate function must be owned by a narrowly privileged role before deployment.

Intake uses `INQUIRY_INTAKE_DATABASE_URL` and `INQUIRY_RATE_HMAC_KEY`; worker uses `INQUIRY_WORKER_DATABASE_URL`. All are server-only secrets. The code currently reads `cf-connecting-ip`, but the Supabase Edge ingress trust boundary has NOT been verified: a forged client header could defeat per-IP limiting. **Do not enable intake until a trusted identity source or edge-enforced rate limit is verified.** The counter currently runs after Turnstile, so unverified attempts are not counted. A separate pre-verification edge limit is still required.

The rate counter uses fixed one-hour windows (five successful Turnstile attempts per identity), not a sliding window. Do not claim production abuse protection until concurrency, spoofing, IPv6, error and recovery tests pass. Rate-limit identity is HMAC-hashed; define retention/cleanup before enabling.

This branch has NOT been deployed or end-to-end tested. Database, mail, public website and main branch remain unchanged.
