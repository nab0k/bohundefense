"""Static regression checks for staged BOHUN business enquiries (no external services)."""
from pathlib import Path
from html.parser import HTMLParser
import re

ROOT = Path(__file__).resolve().parents[1]

class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.names = set()
        self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            assert a["id"] not in self.ids, "duplicate id: " + a["id"]
            self.ids.add(a["id"])
        if "name" in a:
            self.names.add(a["name"])
        if tag == "a":
            self.links.append(a.get("href", ""))

def run():
    page = Scan()
    page.feed((ROOT / "inquiry.html").read_text())
    assert {"inquiry", "submit", "status", "context-id", "context-url"} <= page.ids
    assert {"name", "organization", "email", "message", "acknowledged", "type"} <= page.names
    assert "/privacy.html" in page.links
    assert any("mailto:nabok@bohundefence.com" == x for x in page.links)
    html = (ROOT / "inquiry.html").read_text()
    assert re.search(r'<button[^>]+id="submit"[^>]+disabled', html), "submit must stay disabled until backend passes tests"
    assert "hello@bohundefence.com" not in html
    assert 'inquiry-entrypoints.js' in (ROOT / "index.html").read_text()
    assert 'id="p0-dossier"' in (ROOT / "index.html").read_text()
    assert "Find a Partner" in (ROOT / "assets/atmo22/shell.js").read_text()
    assert "about-project.html" in (ROOT / "assets/atmo22/shell.js").read_text()
    assert "Suggest a company update" in (ROOT / "assets/company-map.js").read_text()
    api = (ROOT / "supabase/functions/business-inquiries/index.ts").read_text()
    assert "TURNSTILE_SECRET_KEY" in api
    assert "INQUIRY_INTAKE_DATABASE_URL" in api
    assert "INQUIRY_INTAKE_ENABLED" in api
    assert "allow_inquiry_attempt" in api
    assert "INQUIRY_RATE_HMAC_KEY" in api
    assert 'env("DATABASE_URL")' not in api
    assert "SUPABASE_SERVICE_ROLE_KEY" not in api
    assert 'RESEND_API_KEY' not in (ROOT / "assets/inquiries.js").read_text()
    assert 'SUPABASE_SERVICE_ROLE_KEY' not in (ROOT / "assets/inquiries.js").read_text()
    worker = (ROOT / "supabase/functions/inquiry-notifications/index.ts").read_text()
    assert "nabok@bohundefence.com" in worker
    assert "NOTIFICATION_WORKER_TOKEN" in worker
    assert "INQUIRY_WORKER_DATABASE_URL" in worker
    assert "claim_inquiry_notifications" in worker
    assert "finish_inquiry_notification" in worker
    assert "reconcile_exhausted_inquiry_notifications" in worker
    assert 'env("DATABASE_URL")' not in worker
    queue = (ROOT / "docs/business-inquiries-queue.sql").read_text()
    grants = (ROOT / "docs/business-inquiries-access-and-rate-limit.sql").read_text()
    assert "notification_attempts < 5" in queue
    assert "notification_lease_until > now()" in queue
    assert "reconcile_exhausted_inquiry_notifications" in queue
    assert "reconcile_exhausted_inquiry_notifications" in grants
    assert "security invoker" in grants.lower()
    assert "security definer" not in grants.lower()
    print("Staged enquiry static checks passed. This is NOT an end-to-end test.")

if __name__ == "__main__":
    run()
