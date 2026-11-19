"""Live data for generated apps: owner endpoints (builder Data tab + preview)
and public endpoints (hosted /app/:slug and the sample gallery)."""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core
from lib.db import db
from lib.generator import ai_complete
from models.schemas import AiIn, AiOut, ColumnCreate, PublicApp, RecordIn, RecordOut, Sample, TableCreate, TableInfo

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

async def _pid(project_id: str, user: dict) -> str:
    await core.owned_project(project_id, user["user_id"])
    return project_id


@router.get("/projects/{project_id}/tables", response_model=list[TableInfo])
async def owner_tables(project_id: str, user: dict = Depends(require_user)):
    return await core.list_tables(await _pid(project_id, user))


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
    if not await db.app_tables.find_one({"project_id": pid, "name": table}):
        raise HTTPException(status_code=404, detail="Table not found")
    await core.ensure_table(pid, table, [name])
    return next(t for t in await core.list_tables(pid) if t.name == table)


@router.delete("/projects/{project_id}/tables/{table}", status_code=204)
async def owner_delete_table(project_id: str, table: str, user: dict = Depends(require_user)):
    pid = await _pid(project_id, user)
    res = await db.app_tables.delete_one({"project_id": pid, "name": table})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    await db.records.delete_many({"project_id": pid, "table": table})
    return Response(status_code=204)


@router.get("/projects/{project_id}/tables/{table}/records", response_model=list[RecordOut])
async def owner_records(project_id: str, table: str, user: dict = Depends(require_user)):
    return await core.list_records(await _pid(project_id, user), table)


@router.get("/projects/{project_id}/tables/{table}/records/{record_id}", response_model=RecordOut)
async def owner_record(project_id: str, table: str, record_id: str, user: dict = Depends(require_user)):
    return await core.get_record(await _pid(project_id, user), table, record_id)


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


# ---------- public (hosted apps + samples) ----------

@router.get("/public/samples", response_model=list[Sample])
async def samples():
    docs = await db.projects.find({"is_sample": True, "html": {"$nin": ["", None]}}, {"_id": 0, "html": 0, "published_html": 0}).sort(
        "created_at", 1).to_list(24)
    out = []
    for d in docs:
        out.append(Sample(
            id=d["id"], title=d["title"], slug=d["slug"], description=d.get("description", ""),
            table_count=await db.app_tables.count_documents({"project_id": d["id"]}),
            record_count=await db.records.count_documents({"project_id": d["id"]}),
            updated_at=core.aware(d["updated_at"]),
        ))
    return out


@router.get("/public/apps/{slug}", response_model=PublicApp)
async def public_app(slug: str):
    d = await core.public_project(slug)
    html = d.get("published_html") or d.get("html", "")
    return PublicApp(title=d["title"], slug=d["slug"], html=html, is_sample=bool(d.get("is_sample")))


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
