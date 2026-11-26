"""Live data for generated apps: owner endpoints (builder Data tab + preview) and public
endpoints (hosted /app/:slug), plus the gallery, per-app stats and app-initiated email."""

import time
from contextlib import asynccontextmanager
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core, email, plans
from lib.dates import today_iso
from lib.db import db
from lib.generator import ai_complete
from models.schemas import (
    AiIn, AiOut, ColumnCreate, DayStat, EmailLog, EmailNotifyIn, EmailOut, EmailReceiptIn, GalleryApp, PublicApp,
    RecordIn, RecordOut, Stats, TableCreate, TableInfo,
)
from routers.projects import views_by_project

router = APIRouter()

_ai_calls: dict[str, list[float]] = defaultdict(list)
AI_LIMIT_PER_HOUR = 40


def _rate_limit(key: str) -> None:
    cutoff = time.time() - 3600
    calls = [t for t in _ai_calls[key] if t > cutoff]
    if len(calls) >= AI_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="AI limit reached for this app, try again later")
    calls.append(time.time())
    _ai_calls[key] = calls


# ---------- owner ----------

async def _pid(project_id: str, user: dict, need: str = "edit") -> str:
    await core.owned_project(project_id, user["user_id"], need=need)
    return project_id


@router.get("/projects/{project_id}/tables", response_model=list[TableInfo])
async def owner_tables(project_id: str, user: dict = Depends(require_user)):
    return await core.list_tables(await _pid(project_id, user, "view"))


@router.post("/projects/{project_id}/tables", response_model=TableInfo, status_code=201)
async def owner_create_table(project_id: str, body: TableCreate, user: dict = Depends(require_user)):
    pid = await _pid(project_id, user)
    cols = [c.strip()[:64] for c in body.columns if c.strip() and c.strip() not in core.RESERVED]
    await core.ensure_table(pid, body.name, cols)
    return next(t for t in await core.list_tables(pid) if t.name == body.name)


@router.post("/projects/{project_id}/tables/{table}/columns", response_model=TableInfo)
async def owner_add_column(project_id: str, table: str, body: ColumnCreate, user: dict = Depends(require_user)):
    pid = await _pid(project_id, user)
    core.check_table(table)
    name = body.name.strip()
    if name in core.RESERVED:
        raise HTTPException(status_code=422, detail="That column name is reserved")
    if not await db.app_tables.find_one({"project_id": pid, "name": table, **core.LIVE}):
        raise HTTPException(status_code=404, detail="Table not found")
    await core.ensure_table(pid, table, [name])
    return next(t for t in await core.list_tables(pid) if t.name == table)


@router.delete("/projects/{project_id}/tables/{table}", status_code=204)
async def owner_delete_table(project_id: str, table: str, user: dict = Depends(require_user)):
    await core.delete_table(await _pid(project_id, user), table)
    return Response(status_code=204)


@router.get("/projects/{project_id}/tables/{table}/records", response_model=list[RecordOut])
async def owner_records(project_id: str, table: str, user: dict = Depends(require_user)):
    return await core.list_records(await _pid(project_id, user, "view"), table)


@router.get("/projects/{project_id}/tables/{table}/records/{record_id}", response_model=RecordOut)
async def owner_record(project_id: str, table: str, record_id: str, user: dict = Depends(require_user)):
    return await core.get_record(await _pid(project_id, user, "view"), table, record_id)


@router.post("/projects/{project_id}/tables/{table}/records", response_model=RecordOut, status_code=201)
async def owner_insert(project_id: str, table: str, body: RecordIn, user: dict = Depends(require_user)):
    return await core.insert_record(await _pid(project_id, user), table, body.data)


@router.patch("/projects/{project_id}/tables/{table}/records/{record_id}", response_model=RecordOut)
async def owner_update(project_id: str, table: str, record_id: str, body: RecordIn, user: dict = Depends(require_user)):
    return await core.update_record(await _pid(project_id, user), table, record_id, body.data)


@router.delete("/projects/{project_id}/tables/{table}/records/{record_id}", status_code=204)
async def owner_delete(project_id: str, table: str, record_id: str, user: dict = Depends(require_user)):
    await core.delete_record(await _pid(project_id, user), table, record_id)
    return Response(status_code=204)


@router.post("/projects/{project_id}/ai", response_model=AiOut)
async def owner_ai(project_id: str, body: AiIn, user: dict = Depends(require_user)):
    pid = await _pid(project_id, user)
    _rate_limit(pid)
    return AiOut(text=await ai_complete(body.prompt, body.system))


@router.post("/projects/{project_id}/email/notify", response_model=EmailOut)
async def owner_notify(project_id: str, body: EmailNotifyIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    to, status = await email.send_owner_notification(doc, body.subject, body.message)
    return EmailOut(ok=True, to=to, status=status)


@router.post("/projects/{project_id}/email/receipt", response_model=EmailOut)
async def owner_receipt(project_id: str, body: EmailReceiptIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    to, status = await email.send_record_receipt(doc, body.table, body.record_id)
    return EmailOut(ok=True, to=to, status=status)


@router.get("/projects/{project_id}/stats", response_model=Stats)
async def owner_stats(project_id: str, user: dict = Depends(require_user)):
    pid = await _pid(project_id, user, "view")
    today = today_iso()
    days = [(core.now() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]
    visits = {v["day"]: v["count"] for v in await db.app_visits.find({"project_id": pid, "day": {"$in": days}}, {"_id": 0}).to_list(30)}
    since = core.now() - timedelta(days=14)
    rec_days = {
        r["_id"]: r["n"] for r in await db.records.aggregate([
            {"$match": {"project_id": pid, "created_at": {"$gte": since}, **core.LIVE}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}},
        ]).to_list(30)
    }
    emails = await db.emails.find({"project_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return Stats(
        views_total=(await views_by_project([pid])).get(pid, 0),
        views_today=visits.get(today, 0),
        records_total=await db.records.count_documents({"project_id": pid, **core.LIVE}),
        tables_total=await db.app_tables.count_documents({"project_id": pid, **core.LIVE}),
        emails_total=await db.emails.count_documents({"project_id": pid, "ok": True}),
        days=[DayStat(day=d, views=visits.get(d, 0), records=rec_days.get(d, 0)) for d in days],
        recent_emails=[EmailLog(**{**e, "status": e.get("status") or ("sent" if e.get("ok") else "failed"),
                                   "created_at": core.aware(e["created_at"])}) for e in emails],
    )


# ---------- public (hosted apps + gallery) ----------

@router.get("/public/gallery", response_model=list[GalleryApp])
async def gallery():
    docs = await db.projects.find(
        {"in_gallery": True, "published": True, "published_html": {"$nin": ["", None]}, **core.LIVE},
        {"_id": 0, "html": 0, "published_html": 0},
    ).sort("published_at", -1).to_list(24)
    views = await views_by_project([d["id"] for d in docs])
    owners = {u["user_id"]: u for u in await db.users.find(
        {"user_id": {"$in": list({d["owner_id"] for d in docs})}}, {"_id": 0, "user_id": 1, "username": 1, "display_name": 1}).to_list(100)}
    return [
        GalleryApp(
            owner_username=owners.get(d["owner_id"], {}).get("username", ""),
            owner_name=owners.get(d["owner_id"], {}).get("display_name", ""),
            id=d["id"], title=d["title"], slug=d["slug"], description=d.get("description", ""),
            record_count=await db.records.count_documents({"project_id": d["id"], **core.LIVE}),
            views=views.get(d["id"], 0), updated_at=core.aware(d.get("published_at") or d["updated_at"]),
        )
        for d in docs
    ]


@router.get("/public/apps/{slug}", response_model=PublicApp)
async def public_app(slug: str, view: int = 0):
    d = await core.public_project(slug)
    if view:  # counted only for full-screen visits, not gallery thumbnails
        await db.app_visits.update_one({"project_id": d["id"], "day": today_iso()}, {"$inc": {"count": 1}}, upsert=True)
    return PublicApp(title=d["title"], slug=d["slug"], html=d.get("published_html") or d.get("html", ""),
                     show_badge=await plans.shows_badge(d["owner_id"]))


@router.get("/public/apps/{slug}/tables/{table}/records", response_model=list[RecordOut])
async def public_records(slug: str, table: str):
    return await core.list_records((await core.public_project(slug))["id"], table)


@router.get("/public/apps/{slug}/tables/{table}/records/{record_id}", response_model=RecordOut)
async def public_record(slug: str, table: str, record_id: str):
    return await core.get_record((await core.public_project(slug))["id"], table, record_id)


@router.post("/public/apps/{slug}/tables/{table}/records", response_model=RecordOut, status_code=201)
async def public_insert(slug: str, table: str, body: RecordIn):
    return await core.insert_record((await core.public_project(slug))["id"], table, body.data)


@router.patch("/public/apps/{slug}/tables/{table}/records/{record_id}", response_model=RecordOut)
async def public_update(slug: str, table: str, record_id: str, body: RecordIn):
    return await core.update_record((await core.public_project(slug))["id"], table, record_id, body.data)


@router.delete("/public/apps/{slug}/tables/{table}/records/{record_id}", status_code=204)
async def public_delete(slug: str, table: str, record_id: str):
    await core.delete_record((await core.public_project(slug))["id"], table, record_id)
    return Response(status_code=204)


@router.post("/public/apps/{slug}/ai", response_model=AiOut)
async def public_ai(slug: str, body: AiIn):
    pid = (await core.public_project(slug))["id"]
    _rate_limit(pid)
    return AiOut(text=await ai_complete(body.prompt, body.system))


@router.post("/public/apps/{slug}/email/notify", response_model=EmailOut)
async def public_notify(slug: str, body: EmailNotifyIn):
    doc = await core.public_project(slug)
    async with _public_email_errors():
        _, status = await email.send_owner_notification(doc, body.subject, body.message)
    return EmailOut(ok=True, status=status)  # never reveal the owner's address to visitors


@router.post("/public/apps/{slug}/email/receipt", response_model=EmailOut)
async def public_receipt(slug: str, body: EmailReceiptIn):
    doc = await core.public_project(slug)
    async with _public_email_errors():
        to, status = await email.send_record_receipt(doc, body.table, body.record_id)
    return EmailOut(ok=True, to=to, status=status)


@asynccontextmanager
async def _public_email_errors():
    """Visitors see a generic message; the owner sees the billing detail in Activity."""
    try:
        yield
    except HTTPException as e:
        if e.status_code == 503:
            raise HTTPException(status_code=503, detail="Email is temporarily unavailable")
        raise
