// BOHUN business enquiries: staged Supabase Edge Function.
// Deploy only after migration, verified sender, secrets and privacy review.
const ORIGIN = "https://bohundefence.com";
const allowed = new Set([ORIGIN, "https://www.bohundefence.com"]);
const env = (key: string) => Deno.env.get(key) || "";
const reply = (status: number, body: Record<string, unknown>, origin = ORIGIN) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": origin, "vary": "Origin" } });
const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max + 1) : "";
const validUrl = (s: string) => !s || (() => { try { return ["https:", "http:"].includes(new URL(s).protocol); } catch { return false; } })();
async function verifyTurnstile(token: string, ip: string) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret || !token) return false; // fail closed
  const data = new FormData();
  data.set("secret", secret); data.set("response", token);
  if (ip) data.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: data, signal: AbortSignal.timeout(6000) });
  return res.ok && (await res.json()).success === true;
}
Deno.serve(async req => {
  const origin = req.headers.get("origin") || "";
  if (!allowed.has(origin)) return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600", "vary": "Origin" } });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  const type = req.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) return reply(415, { error: "JSON required" }, origin);
  if (Number(req.headers.get("content-length") || 0) > 12000) return reply(413, { error: "Payload too large" }, origin);
  let raw: unknown;
  try { raw = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }, origin); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return reply(400, { error: "Invalid payload" }, origin);
  const b = raw as Record<string, unknown>;
  if (b.website) return reply(200, { ok: true }, origin); // honeypot
  const name = str(b.name, 120), organization = str(b.organization, 160), email = str(b.email, 254), message = str(b.message, 4000);
  const inquiryType = str(b.type, 30);
  const relationship = str(b.relationship, 120), region = str(b.region, 120), source_url = str(b.source_url, 500);
  const context_type = str(b.context_type, 30), context_id = str(b.context_id, 200), context_url = str(b.context_url, 800);
  if (!["opportunity", "partner", "company"].includes(inquiryType) || !name || !organization || !message || name.length > 120 || organization.length > 160 || message.length > 4000 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validUrl(source_url) || !validUrl(context_url) || !["", "article", "company"].includes(context_type))
    return reply(422, { error: "Please check the required fields" }, origin);
  if (b.acknowledged !== true) return reply(422, { error: "Acknowledgement required" }, origin);
  const ip = (req.headers.get("cf-connecting-ip") || "").slice(0, 64);
  let human = false;
  try { human = await verifyTurnstile(str(b.turnstile_token, 4096), ip); } catch { /* fail closed */ }
  if (!human) return reply(403, { error: "Verification failed" }, origin);
  const dbUrl = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !key) return reply(503, { error: "Service unavailable" }, origin);
  // Supabase REST API must be configured to expose bohun_private ONLY to server-side service role.
  // If private schema is not exposed, use a dedicated restricted RPC instead.
  const row = { type: inquiryType, name, organization, email, message, relationship, region, source_url, context_type, context_id, context_url };
  let stored: { id: string };
  try {
    const response = await fetch(dbUrl + "/rest/v1/business_inquiries?select=id", { method: "POST", headers: { "apikey": key, "authorization": "Bearer " + key, "content-type": "application/json", "accept": "application/json", "prefer": "return=representation", "accept-profile": "bohun_private", "content-profile": "bohun_private" }, body: JSON.stringify(row), signal: AbortSignal.timeout(8000) });
    if (!response.ok) { console.error("Inquiry insert failed", response.status); return reply(503, { error: "Could not save enquiry" }, origin); }
    const rows = await response.json(); stored = rows[0];
    if (!stored?.id) return reply(503, { error: "Could not confirm enquiry" }, origin);
  } catch { return reply(503, { error: "Could not save enquiry" }, origin); }
  // Notifications are dispatched by a separate authenticated worker processing pending rows.
  // This endpoint NEVER sends email before a durable insert.
  return reply(201, { ok: true, id: stored.id, notification: "queued" }, origin);
});
