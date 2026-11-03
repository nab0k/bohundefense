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
