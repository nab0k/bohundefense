"""Static contract checks for PR35 backend draft against PR37 main. NO DEPLOY."""
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class FormScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_form = False
        self.action = None
        self.names = set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form" and a.get("id") == "enquiry":
            self.in_form = True
            self.action = a.get("action")
        if self.in_form and "name" in a:
            self.names.add(a["name"])
    def handle_endtag(self, tag):
        if tag == "form":
            self.in_form = False

def run():
    page = FormScan()
    page.feed((ROOT / "contact.html").read_text())
    assert page.action == "https://formspree.io/f/xbdwvgqp", "Formspree must remain active"
    assert {"topic", "name", "organisation", "email", "message", "_gotcha"} <= page.names
    for path in ("about.html", "services.html", "index.html"):
        assert (ROOT / path).exists(), path
    api = (ROOT / "supabase/functions/business-inquiries/index.ts").read_text()
    assert 'INQUIRY_INTAKE_ENABLED' in api
    assert 'INQUIRY_INTAKE_DATABASE_URL' in api
    assert 'TURNSTILE_SECRET_KEY' in api
    assert 'allow_inquiry_attempt' in api
    for token in ("b.organisation", "b.topic", "b.idempotency_key",
                  "on conflict (idempotency_key) do nothing", "b._gotcha"):
        assert token in api, token
    schema = (ROOT / "docs/business-inquiries-schema.sql").read_text()
    assert "idempotency_key uuid not null unique" in schema
    assert "topic text not null" in schema
    worker = (ROOT / "supabase/functions/inquiry-notifications/index.ts").read_text()
    for name in ("RESEND_API_KEY", "INQUIRY_WORKER_DATABASE_URL",
                 "NOTIFICATION_WORKER_TOKEN", "claim_inquiry_notifications",
                 "finish_inquiry_notification"):
        assert name in worker, name
    grants = (ROOT / "docs/business-inquiries-access-and-rate-limit.sql").read_text().lower()
    assert "security invoker" in grants
    assert "grant select (id, idempotency_key)" in grants
    assert "grant select, update on bohun_private.business_inquiries" not in grants
    print("PASS PR37 Formspree contract preserved; PR35 backend files present.")
    print("NOTE Static checks only: not a staging integration or delivery test.")

if __name__ == "__main__":
    run()
