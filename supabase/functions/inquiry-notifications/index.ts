// STAGED ONLY. No deployment or scheduler until migration, secrets and tests are approved.
// Uses direct server-side PostgreSQL access to the non-exposed bohun_private schema.
// INQUIRY_WORKER_DATABASE_URL must be a server-only, least-privilege connection string.
import postgres from "npm:postgres@3.4.5";

const env = (name: string) => Deno.env.get(name) || "";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

type ClaimedInquiry = {
  id: string;
  type: string;
  name: string;
  organization: string;
  email: string;
  context_url: string | null;
  notification_attempts: number;
  claim_token: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = env("NOTIFICATION_WORKER_TOKEN");
  if (!token || req.headers.get("authorization") !== "Bearer " + token) {
    return json(401, { error: "Unauthorized" });
  }
  if (env("INQUIRY_NOTIFICATION_WORKER_ENABLED") !== "true") {
    return json(503, { error: "Worker disabled" });
  }
  if (!env("INQUIRY_WORKER_DATABASE_URL") || !env("RESEND_API_KEY") || !env("RESEND_FROM_EMAIL")) {
    return json(503, { error: "Not configured" });
  }

  // Private RPCs run with the database connection role's privileges.
  // Do not use an exposed REST schema or grant access to anon/authenticated.
  const sql = postgres(env("INQUIRY_WORKER_DATABASE_URL"), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    ssl: "require",
    prepare: false,
  });
  let processed = 0, sent = 0, failed = 0;
  try {
    const rows = await sql<ClaimedInquiry[]>`
      select * from bohun_private.claim_inquiry_notifications(10)
    `;
    for (const row of rows) {
      processed++;
      const subject = "BOHUN enquiry: " + row.type + " / " + row.id;
      const body = [
        "New BOHUN business enquiry",
        "Reference: " + row.id,
        "Type: " + row.type,
        "Name: " + row.name,
        "Organisation: " + row.organization,
        "Email: " + row.email,
        "Context: " + (row.context_url || "None"),
        "",
        "Open the private database to review the full message.",
        "Do not reply to this notification.",
      ].join("\n");

      let delivered = false;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: "Bearer " + env("RESEND_API_KEY"),
            "content-type": "application/json",
            "Idempotency-Key": "bohun-enquiry/" + row.id,
          },
          body: JSON.stringify({
            from: env("RESEND_FROM_EMAIL"),
            to: ["nabok@bohundefence.com"],
            subject,
            text: body,
          }),
          signal: AbortSignal.timeout(10000),
        });
        delivered = response.ok;
        if (!delivered) console.error("Resend returned status", response.status);
      } catch {
        console.error("Resend request failed");
      }

      try {
        const result = await sql<{ finished: boolean }[]>`
          select bohun_private.finish_inquiry_notification(
            ${row.id}::uuid, ${row.claim_token}::uuid, ${delivered}
          ) as finished
        `;
        if (result[0]?.finished === true) {
          if (delivered) sent++;
          else failed++;
        } else {
          // Lease may have expired or another worker may have reclaimed the row.
          console.error("Notification claim no longer owned", row.id);
          failed++;
        }
      } catch {
        // Do not mark as sent without durable DB confirmation.
        // Lease expiry makes the row eligible for a later retry.
        console.error("Could not finalize notification", row.id);
        failed++;
      }
    }
    return json(200, { processed, sent, failed });
  } catch {
    console.error("Private notification queue unavailable");
    return json(503, { error: "Queue unavailable" });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
