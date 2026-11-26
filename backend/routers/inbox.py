"""The Kozzi Inbox: every email Kozzi or an app wrote, with its delivery status.
Queued emails (delivery paused on the Emergent account) are resent by a platform cron."""

import asyncio
import hmac
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core, email
from lib.db import db
from models.schemas import FlushOut, Inbox, InboxEmail

router = APIRouter()
_flush_lock = asyncio.Lock()


@router.get("/inbox", response_model=Inbox)
async def get_inbox(user: dict = Depends(require_user)):
    owner = user["user_id"]
    docs = await db.emails.find({"owner_id": owner}, {"_id": 0, "html": 0}).sort("created_at", -1).to_list(200)
    ids = list({d["project_id"] for d in docs})
    titles = {p["id"]: p["title"] for p in await db.projects.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(len(ids) + 1)}
    queued = [d for d in docs if d.get("status") == "queued"]
    return Inbox(
        emails=[
            InboxEmail(**{**d, "project_title": "Enterprise enquiry" if d.get("kind") == "enquiry" else titles.get(d["project_id"], "Deleted project"),
                          "created_at": core.aware(d["created_at"]), "sent_at": core.aware(d.get("sent_at"))})
            for d in docs
        ],
        unread=sum(1 for d in docs if not d.get("read") and d.get("kind") != "receipt"),
        queued=len(queued),
        paused_reason=queued[0].get("last_error", "") if queued else "",
    )


async def _own(email_id: str, user: dict) -> dict:
    doc = await db.emails.find_one({"id": email_id, "owner_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Email not found")
    return doc


@router.post("/inbox/read-all", status_code=204)
async def read_all(user: dict = Depends(require_user)):
    await db.emails.update_many({"owner_id": user["user_id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return Response(status_code=204)


@router.post("/inbox/{email_id}/read", status_code=204)
async def mark_read(email_id: str, user: dict = Depends(require_user)):
    await _own(email_id, user)
    await db.emails.update_one({"id": email_id}, {"$set": {"read": True}})
    return Response(status_code=204)


@router.post("/inbox/{email_id}/mark-sent", status_code=204)
async def mark_sent(email_id: str, user: dict = Depends(require_user)):
    """The owner sent it from their own email app, so take it out of the resend queue."""
    doc = await _own(email_id, user)
    if doc.get("status") not in ("queued", "failed"):
        raise HTTPException(status_code=409, detail="This email was already delivered")
    await db.emails.update_one({"id": email_id}, {"$set": {"status": "sent_manually", "read": True, "sent_at": core.now()}})
    return Response(status_code=204)


@router.post("/inbox/flush", response_model=FlushOut)
async def flush_mine(user: dict = Depends(require_user)):
    async with _flush_lock:
        return FlushOut(**await email.flush_outbox(user["user_id"]))


async def _flush_all() -> None:
    if _flush_lock.locked():
        return
    async with _flush_lock:
        await email.flush_outbox()


@router.post("/cron/email-outbox", status_code=202)
async def cron_email_outbox(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("x-webhook-id") or (body or {}).get("run_id") or ""
    if run_id:
        res = await db.cron_runs.update_one({"run_id": run_id}, {"$setOnInsert": {"run_id": run_id, "at": core.now()}}, upsert=True)
        if res.upserted_id is None:
            return {"accepted": True, "duplicate": True}
    background.add_task(_flush_all)
    return {"accepted": True}
