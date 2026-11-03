## Resend integration (staged, not deployed)

**Recipient:** `nabok@bohundefence.com`.

**Proposed sender:** `BOHUN Atlas <notifications@bohundefence.com>` only **after** Resend verifies the BOHUN sending domain. The sender is a proposed outbound address, **not** an existing mailbox. Configure it via `RESEND_FROM_EMAIL`.

**Resend account prerequisites**
1. Add `bohundefence.com` (or a dedicated sending subdomain) in Resend Domains and configure the DNS records Resend provides (SPF/DKIM; DMARC alignment review). Do not overwrite existing MX or SPF blindly.
2. Create a send-only Resend API key; store as Edge Function secret `RESEND_API_KEY`. Never commit keys.
3. Set `RESEND_FROM_EMAIL` to the verified sender; `NOTIFICATION_WORKER_TOKEN` to a long random secret, in server secrets only.
4. Verify recipient delivery and check spam filtering using a non-sensitive synthetic enquiry.

**Draft implementation:** `supabase/functions/inquiry-notifications/index.ts` is an **unreleased prototype**, intentionally not suitable for a production schedule. It uses Resend's HTTP API with `Idempotency-Key: bohun-enquiry/<uuid>` to reduce duplicates. Resend idempotency expires after 24 hours, so permanent exactly-once delivery is not guaranteed. Before activation, replace simple polling with an atomic SQL claim/lease, retry backoff, stale lease recovery and monitoring. The private schema REST access still needs a secure supported configuration or a dedicated locked-down RPC. No email is sent by creating this file.

**Privacy:** Notifications deliberately omit the enquiry message body; read it only in the private database. Sender address is not a reply inbox unless separately configured.

**Important:** The inbound form remains disabled until Turnstile, rate limits, queue worker, database, privacy text and all three scenarios pass tests.
