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
            raise HTTPException(status_code=503, detail=OWNER_PAUSED.get(code, "Email is temporarily unavailable"))
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text[:300])
        raise HTTPException(status_code=502, detail="Failed to send email")
    except HTTPException:
        raise
    except Exception as e:  # network errors
        logger.error("Email send error: %s", e)
        raise HTTPException(status_code=502, detail="Failed to send email")


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
            primary = data.get("primary_email_address_id")
            for a in data.get("email_addresses", []):
                if a.get("id") == primary or not email:
                    email = a.get("email_address", "") or email
    except Exception as exc:
        logger.warning("Clerk email lookup failed: %s", exc)
    if email:
        await db.users.update_one({"user_id": owner_id}, {"$set": {"email": email}}, upsert=True)
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


# ---------- logging + caps ----------

async def _check_cap(project_id: str) -> None:
    if await db.emails.count_documents({"project_id": project_id, "day": today_iso(), "ok": True}) >= DAILY_CAP_PER_APP:
        raise HTTPException(status_code=429, detail="This app has reached today's email limit")


async def _log(project_id: str, kind: str, to: str, subject: str, ok: bool, record_id: str | None = None) -> None:
    await db.emails.insert_one({
        "id": str(uuid.uuid4()), "project_id": project_id, "kind": kind, "to": to, "subject": subject,
        "ok": ok, "record_id": record_id, "day": today_iso(), "created_at": core.now(),
    })


async def _deliver(project_id: str, kind: str, to: str, subject: str, html: str, record_id: str | None = None) -> None:
    try:
        await _send(to=to, subject=subject, html=html)
    except Exception:
        await _log(project_id, kind, to, subject, False, record_id)
        raise
    await _log(project_id, kind, to, subject, True, record_id)


# ---------- the three send paths ----------

async def send_builder_email(project: dict, subject: str, body: str) -> str:
    """Kozzi chat: 'email me a summary'. Always goes to the signed-in owner."""
    to = await owner_email(project["owner_id"])
    if not to:
        raise HTTPException(status_code=409, detail="Your account has no email address")
    await _check_cap(project["id"])
    subject = core.tidy(subject.strip())[:120] or f"Update on {project['title']}"
    html = _wrap(subject, _paragraphs(core.tidy(body)[:6000]), f"You asked Kozzi for this while editing {project['title']}.")
    await _deliver(project["id"], "builder", to, subject, html)
    return to


async def send_owner_notification(project: dict, subject: str, message: str) -> str:
    """kozzi.email.notifyOwner() from inside an app: goes only to the app's owner."""
    to = await owner_email(project["owner_id"])
    if not to:
        raise HTTPException(status_code=409, detail="This app's owner has no email address")
    await _check_cap(project["id"])
    full_subject = f"{project['title']}: {subject.strip()}"[:140]
    html = _wrap(subject.strip(), _paragraphs(message), f"Your app {project['title']} sent this notification.")
    await _deliver(project["id"], "notify", to, full_subject, html)
    return to


async def send_record_receipt(project: dict, table: str, record_id: str) -> str:
    """kozzi.email.sendReceipt() from inside an app: a fixed confirmation to the address
    stored in that record's email field, once per record."""
    doc = await db.records.find_one({"project_id": project["id"], "table": table, "id": record_id, **core.LIVE}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    to = record_email(doc.get("data", {}))
    if not to:
        raise HTTPException(status_code=422, detail="That record has no valid email field")
    if await db.emails.find_one({"project_id": project["id"], "record_id": record_id, "ok": True}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="A confirmation was already sent for this record")
    await _check_cap(project["id"])
    rows = []
    for k, v in list(doc.get("data", {}).items())[:12]:
        if isinstance(v, (dict, list)) or v in ("", None):
            continue
        rows.append(
            f'<tr><td style="padding:6px 12px 6px 0;color:#666664;vertical-align:top">{escape(str(k).replace("_", " "))}</td>'
            f'<td style="padding:6px 0">{escape(str(v)[:200])}</td></tr>'
        )
    subject = f"Confirmation from {project['title']}"[:140]
    body = (
        f'<p style="margin:0 0 14px;line-height:1.6">Thanks, your submission to {escape(project["title"])} was received. '
        'Here is what was saved:</p>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">{"".join(rows)}</table>'
    )
    html = _wrap("Submission received", body, f"You are getting this because this address was entered in {project['title']}.")
    await _deliver(project["id"], "receipt", to, subject, html, record_id)
    return to
