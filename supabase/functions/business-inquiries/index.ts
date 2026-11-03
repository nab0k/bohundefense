// STAGED ONLY. Do not deploy before rate limiting, privacy, secrets and E2E tests.
// Private PostgreSQL connection; never expose DATABASE_URL to browser clients.
import postgres from "npm:postgres@3.4.5";

const ORIGIN = "https://bohundefence.com";
const allowed = new Set([ORIGIN, "https://www.bohundefence.com"]);
const env = (key: string) => Deno.env.get(key) || "";
const reply = (status: number, body: Record<string, unknown>, origin = ORIGIN) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json", "cache-control": "no-store",
      "access-control-allow-origin": origin, "vary": "Origin",
    },
  });
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max + 1) : "";
const validUrl = (s: string) => !s || (() => {
  try { return ["https:", "http:"].includes(new URL(s).protocol); }
  catch { return false; }
})();
async function verifyTurnstile(token: string, ip: string) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret || !token) return false;
  const data = new FormData();
  data.set("secret", secret);
  data.set("response", token);
  if (ip) data.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: data, signal: AbortSignal.timeout(6000),
  });
  const result = await res.json();
  // Optional hostname check is mandatory for production; token alone is insufficient.
  return res.ok && result.success === true && allowed.has("https://" + result.hostname);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (!allowed.has(origin)) return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600", "vary": "Origin",
    },
  });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return reply(415, { error: "JSON required" }, origin);
  }
  if (Number(req.headers.get("content-length") || 0) > 12000) {
    return reply(413, { error: "Payload too large" }, origin);
  }
  // Enforce actual byte limit even when Content-Length is absent.
  let raw: unknown;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "Empty body" }, origin);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) {
        await reader.cancel();
        return reply(413, { error: "Payload too large" }, origin);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return reply(400, { error: "Invalid JSON" }, origin);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reply(400, { error: "Invalid payload" }, origin);
  }
  const b = raw as Record<string, unknown>;
  if (b.website) return reply(200, { ok: true }, origin);
  const name = str(b.name, 120), organization = str(b.organization, 160);
  const email = str(b.email, 254), message = str(b.message, 4000);
  const inquiryType = str(b.type, 30);
  const relationship = str(b.relationship, 120), region = str(b.region, 120);
  const source_url = str(b.source_url, 500), context_type = str(b.context_type, 30);
  const context_id = str(b.context_id, 200), context_url = str(b.context_url, 800);
  if (!["opportunity", "partner", "company"].includes(inquiryType) ||
      !name || !organization || !message ||
      name.length > 120 || organization.length > 160 || message.length > 4000 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validUrl(source_url) || !validUrl(context_url) ||
      !["", "article", "company"].includes(context_type)) {
    return reply(422, { error: "Please check the required fields" }, origin);
  }
  if (b.acknowledged !== true) {
    return reply(422, { error: "Acknowledgement required" }, origin);
  }
  // Do not trust arbitrary X-Forwarded-For headers. Configure trusted proxy rate limits.
  const ip = (req.headers.get("cf-connecting-ip") || "").slice(0, 64);
  let human = false;
  try { human = await verifyTurnstile(str(b.turnstile_token, 4096), ip); }
  catch { /* fail closed */ }
  if (!human) return reply(403, { error: "Verification failed" }, origin);

  // Deployment safety gate: remain disabled until durable rate limiting and E2E checks pass.
  if (env("INQUIRY_INTAKE_ENABLED") !== "true") {
    return reply(503, { error: "Enquiry intake is not yet available" }, origin);
  }
  if (!env("INQUIRY_INTAKE_DATABASE_URL") || !env("INQUIRY_RATE_HMAC_KEY")) {
    return reply(503, { error: "Service unavailable" }, origin);
  }
  // Rate limit before Turnstile verification requires an additional check
  // earlier in the request lifecycle; currently it limits only verified attempts.
  // Fail closed when trusted client identity is unavailable.
  const trustedIp = req.headers.get("cf-connecting-ip") || "";
  if (!trustedIp) return reply(503, { error: "Verification unavailable" }, origin);
  const hmacKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env("INQUIRY_RATE_HMAC_KEY")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC", hmacKey, new TextEncoder().encode(trustedIp),
  );
  const identityHash = Array.from(new Uint8Array(digest))
    .map(v => v.toString(16).padStart(2, "0")).join("");
  const sql = postgres(env("INQUIRY_INTAKE_DATABASE_URL"), {
    max: 1, idle_timeout: 5, connect_timeout: 5, ssl: "require", prepare: false,
  });
  try {
    const limits = await sql<{ allowed: boolean }[]>`
      select bohun_private.allow_inquiry_attempt(${identityHash}, 5) as allowed
    `;
    if (limits[0]?.allowed !== true) {
      return reply(429, { error: "Too many requests. Try again later." }, origin);
    }
    const rows = await sql<{ id: string }[]>`
      insert into bohun_private.business_inquiries
        (type, name, organization, email, message, relationship, region,
         source_url, context_type, context_id, context_url)
      values
        (${inquiryType}, ${name}, ${organization}, ${email}, ${message},
         ${relationship}, ${region}, ${source_url}, ${context_type},
         ${context_id}, ${context_url})
      returning id
    `;
    if (!rows[0]?.id) return reply(503, { error: "Could not confirm enquiry" }, origin);
    // Receipt confirms durable storage, not successful mail delivery.
    return reply(201, { ok: true, id: rows[0].id, notification: "queued" }, origin);
  } catch {
    console.error("Inquiry insert failed");
    return reply(503, { error: "Could not save enquiry" }, origin);
  } finally {
    await sql.end({ timeout: 2 });
  }
});
