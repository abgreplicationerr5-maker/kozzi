"""Transactional email through Emergent's managed email proxy.

Guardrails: every recipient comes from server-side data (the project owner's Clerk email,
or the `email` field of a stored record), every body is a fixed template here with all
interpolated text escaped, sends are capped per app per day, and `_assert_safe_email`
runs on every send."""

import ipaddress
import logging
import os
import re
import uuid
from datetime import timedelta
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

from lib import core
from lib.dates import today_iso
from lib.db import db

load_dotenv()
logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant on purpose, survives deployment
DAILY_CAP_PER_APP = 30
class EmailPaused(HTTPException):
    """The provider refused for a billing reason. The email is kept in the outbox and resent later."""


# Shown to the app owner (builder chat, Activity). Visitors of live apps get a generic message.
OWNER_PAUSED = {
    "insufficient_credits": "Email is paused: the Emergent Universal Key balance can't cover email sends right now. Raise its budget or turn on auto top-up under Universal Key in Buy Credits, then retry",
    "integration_disabled": "Email is paused: the email integration is turned off under Integrations in Emergent",
    "daily_limit_reached": "Email is paused: today's Universal Key spend limit is used up. Raise it under Universal Key in Buy Credits",
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _key() -> str:
    return os.environ.get("EMERGENT_EMAIL_KEY", "")


def _from_name() -> str:
    return os.environ["EMAIL_FROM_NAME"]


# ---------- guardrail gate (verbatim from the managed email playbook) ----------

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} differs from real link host {real!r} (G3)")


async def _send(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": _from_name()}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": _key()}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning("Email paused: %s (%s)", code, e.response.status_code)
            raise EmailPaused(status_code=503, detail=OWNER_PAUSED.get(code, "Email is temporarily unavailable"))
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text[:300])
        if code == "undeliverable_recipient":
            raise HTTPException(status_code=422, detail="That address looks undeliverable, so the email was not sent")
        # 503, not 502: the edge proxy replaces 502 bodies with its own page
        raise HTTPException(status_code=503, detail="The email service rejected this email")
    except HTTPException:
        raise
    except Exception as e:  # network errors
        logger.error("Email send error: %s", e)
        raise HTTPException(status_code=503, detail="Couldn't reach the email service")


# ---------- templates ----------

def _paragraphs(text: str) -> str:
    out = []
    for block in re.split(r"\n\s*\n", text.strip())[:30]:
        lines = [escape(line) for line in block.splitlines()]
        out.append(f'<p style="margin:0 0 14px;line-height:1.6">{"<br>".join(lines)}</p>')
    return "".join(out)


def _wrap(heading: str, body_html: str, footer: str) -> str:
    brand = escape(_from_name())
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9F9F8;padding:32px 0">'
        '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
        'style="background:#FFFFFF;border:1px solid #E5E5E3;border-radius:12px">'
        '<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;color:#111111;font-size:14px">'
        f'<p style="margin:0 0 18px;font-size:13px;color:#666664">{brand}</p>'
        f'<h1 style="margin:0 0 18px;font-size:19px;font-weight:600">{escape(heading)}</h1>'
        f'{body_html}'
        f'<p style="margin:24px 0 0;font-size:12px;color:#9A9A97">{escape(footer)} Sent by {brand}. '
        'We never ask for passwords or payment details by email.</p>'
        '</td></tr></table></td></tr></table>'
    )


# ---------- recipients ----------

async def owner_email(owner_id: str) -> str:
    """The project owner's primary Clerk email, cached on the users document."""
    user = await db.users.find_one({"user_id": owner_id}, {"_id": 0, "email": 1})
    if user and user.get("email"):
        return user["email"]
    secret = os.environ.get("CLERK_SECRET_KEY", "")
    email = ""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"https://api.clerk.com/v1/users/{owner_id}", headers={"Authorization": f"Bearer {secret}"})
        if r.status_code == 200:
            data = r.json()
            avatar = data.get("image_url") or ""
            primary = data.get("primary_email_address_id")
            for a in data.get("email_addresses", []):
                if a.get("id") == primary or not email:
                    email = a.get("email_address", "") or email
    except Exception as exc:
        logger.warning("Clerk email lookup failed: %s", exc)
    if email:
        await db.users.update_one({"user_id": owner_id}, {"$set": {"email": email, "avatar_url": locals().get("avatar", "")}}, upsert=True)
    return email


def record_email(data: dict) -> str:
    for key in ("email", "email_address", "guest_email", "contact_email"):
        v = data.get(key)
        if isinstance(v, str) and EMAIL_RE.match(v.strip()):
            return v.strip()
    for k, v in data.items():
        if "email" in k.lower() and isinstance(v, str) and EMAIL_RE.match(v.strip()):
            return v.strip()
    return ""


# ---------- outbox: every email is stored, shown in the Kozzi Inbox, and resent if paused ----------

MAX_ATTEMPTS = 200          # about two days of 15-minute resend runs
QUEUE_DAYS = 7


async def _check_cap(project_id: str) -> None:
    from lib.plans import emails_per_day  # local import: plans imports core, core is imported here
    project = await db.projects.find_one({"id": project_id}, {"_id": 0, "owner_id": 1}) or {}
    cap = await emails_per_day(project.get("owner_id", "")) if project else DAILY_CAP_PER_APP
    used = await db.emails.count_documents({"project_id": project_id, "day": today_iso(), "status": {"$in": ["sent", "queued"]}})
    if used >= cap:
        raise HTTPException(status_code=429, detail="This app has reached today's email limit")


async def _deliver(project: dict, kind: str, to: str, subject: str, html: str, text: str, record_id: str | None = None) -> str:
    """Store the email, try to send it now, and keep it queued if sending is paused.
    Returns the status: sent | queued. Raises for any other failure."""
    _assert_safe_email(subject, html)
    doc = {
        "id": str(uuid.uuid4()), "project_id": project["id"], "owner_id": project["owner_id"], "kind": kind,
        "to": to, "subject": subject, "html": html, "text": text, "record_id": record_id,
        "status": "queued", "ok": False, "attempts": 0, "last_error": "", "read": False,
        "day": today_iso(), "created_at": core.now(), "sent_at": None,
    }
    await db.emails.insert_one(doc)
    return await _attempt(doc)


async def _attempt(doc: dict) -> str:
    try:
        await _send(to=doc["to"], subject=doc["subject"], html=doc["html"])
    except ValueError as e:  # blocked by the safety gate: never retried
        await db.emails.update_one({"id": doc["id"]}, {"$set": {"status": "failed", "last_error": "Blocked by the email safety check"}, "$inc": {"attempts": 1}})
        raise HTTPException(status_code=422, detail=f"Email blocked by the safety check: {e}")
    except EmailPaused as e:
        await db.emails.update_one({"id": doc["id"]}, {"$set": {"status": "queued", "last_error": str(e.detail)}, "$inc": {"attempts": 1}})
        return "queued"
    except HTTPException as e:
        await db.emails.update_one({"id": doc["id"]}, {"$set": {"status": "failed", "last_error": str(e.detail)}, "$inc": {"attempts": 1}})
        raise
    await db.emails.update_one({"id": doc["id"]}, {"$set": {"status": "sent", "ok": True, "last_error": "", "sent_at": core.now()}, "$inc": {"attempts": 1}})
    return "sent"


async def flush_outbox(owner_id: str | None = None, limit: int = 100) -> dict:
    """Resend queued emails, oldest first. Stops at the first billing refusal since the rest would fail too."""
    q: dict = {"status": "queued", "created_at": {"$gte": core.now() - timedelta(days=QUEUE_DAYS)}, "attempts": {"$lt": MAX_ATTEMPTS}}
    if owner_id:
        q["owner_id"] = owner_id
    sent = 0
    for doc in await db.emails.find(q, {"_id": 0}).sort("created_at", 1).to_list(limit):
        try:
            if await _attempt(doc) == "queued":
                break
            sent += 1
        except HTTPException:
            continue
    left = await db.emails.count_documents({k: v for k, v in q.items() if k != "attempts"})
    return {"sent": sent, "queued": left}


# ---------- the three send paths ----------

async def send_builder_email(project: dict, subject: str, body: str) -> tuple[str, str]:
    """Kozzi chat: 'email me a summary'. Always goes to the signed-in owner."""
    to = await owner_email(project["owner_id"])
    if not to:
        raise HTTPException(status_code=409, detail="Your account has no email address")
    await _check_cap(project["id"])
    subject = core.tidy(subject.strip())[:120] or f"Update on {project['title']}"
    body = core.tidy(body)[:6000]
    html = _wrap(subject, _paragraphs(body), f"You asked Kozzi for this while editing {project['title']}.")
    return to, await _deliver(project, "builder", to, subject, html, body)


async def send_owner_notification(project: dict, subject: str, message: str) -> tuple[str, str]:
    """kozzi.email.notifyOwner() from inside an app: goes only to the app's owner."""
    to = await owner_email(project["owner_id"])
    if not to:
        raise HTTPException(status_code=409, detail="This app's owner has no email address")
    await _check_cap(project["id"])
    full_subject = f"{project['title']}: {subject.strip()}"[:140]
    html = _wrap(subject.strip(), _paragraphs(message), f"Your app {project['title']} sent this notification.")
    return to, await _deliver(project, "notify", to, full_subject, html, message.strip())


async def send_record_receipt(project: dict, table: str, record_id: str) -> tuple[str, str]:
    """kozzi.email.sendReceipt() from inside an app: a fixed confirmation to the address
    stored in that record's email field, once per record."""
    doc = await db.records.find_one({"project_id": project["id"], "table": table, "id": record_id, **core.LIVE}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    to = record_email(doc.get("data", {}))
    if not to:
        raise HTTPException(status_code=422, detail="That record has no valid email field")
    if await db.emails.find_one({"project_id": project["id"], "record_id": record_id, "status": {"$in": ["sent", "queued", "sent_manually"]}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="A confirmation was already sent for this record")
    await _check_cap(project["id"])
    rows, lines = [], []
    for k, v in list(doc.get("data", {}).items())[:12]:
        if isinstance(v, (dict, list)) or v in ("", None):
            continue
        label = str(k).replace("_", " ")
        rows.append(
            f'<tr><td style="padding:6px 12px 6px 0;color:#666664;vertical-align:top">{escape(label)}</td>'
            f'<td style="padding:6px 0">{escape(str(v)[:200])}</td></tr>'
        )
        lines.append(f"- {label}: {str(v)[:200]}")
    subject = f"Confirmation from {project['title']}"[:140]
    intro = f"Thanks, your submission to {project['title']} was received. Here is what was saved:"
    body = (
        f'<p style="margin:0 0 14px;line-height:1.6">{escape(intro)}</p>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">{"".join(rows)}</table>'
    )
    html = _wrap("Submission received", body, f"You are getting this because this address was entered in {project['title']}.")
    return to, await _deliver(project, "receipt", to, subject, html, intro + "\n\n" + "\n".join(lines), record_id)


async def send_enquiry_alerts(enquiry: dict) -> int:
    """Every admin gets the enquiry in their Kozzi Inbox, and by email when delivery works."""
    from lib.roles import IN_ENV  # local import keeps email free of auth imports at load time
    admins = await db.users.find({"role": "admin", **IN_ENV}, {"_id": 0, "user_id": 1, "email": 1}).to_list(50)
    subject = f"Enterprise enquiry: {enquiry['company']} ({enquiry['team_size']} people)"[:140]
    lines = [f"Name: {enquiry['name']}", f"Email: {enquiry['email']}", f"Company: {enquiry['company']}", f"Team size: {enquiry['team_size']}"]
    text = "\n".join(lines) + (f"\n\n{enquiry['message']}" if enquiry.get("message") else "")
    html = _wrap(subject, _paragraphs(text), "You get this because you are a Kozzi admin. Reply from the Kozzi Inbox or the Admin page.")
    count = 0
    for a in admins:
        to = a.get("email") or await owner_email(a["user_id"])
        if not to:
            continue
        doc = {
            "id": str(uuid.uuid4()), "project_id": "", "owner_id": a["user_id"], "kind": "enquiry", "to": to,
            "subject": subject, "html": html, "text": text, "record_id": None, "reply_to": enquiry["email"],
            "status": "queued", "ok": False, "attempts": 0, "last_error": "", "read": False,
            "day": today_iso(), "created_at": core.now(), "sent_at": None,
        }
        await db.emails.insert_one(doc)
        try:
            await _attempt(doc)
        except HTTPException:
            pass  # stays in the Inbox as failed; the admin still sees it
        count += 1
    return count
