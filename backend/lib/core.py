"""Shared helpers: project serialization, ownership checks, and the flexible
per-project table/record data layer used by both the builder and hosted apps."""

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from lib.db import db
from models.schemas import Project, ProjectSummary, RecordOut, TableInfo

TABLE_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
MAX_RECORDS_PER_TABLE = 5000
MAX_TABLES = 50
RESERVED = {"id", "created_at", "updated_at"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:40].strip("-") or "app"


async def unique_slug(base: str) -> str:
    base = slugify(base)
    slug = base
    while await db.projects.find_one({"slug": slug}, {"_id": 1}):
        slug = f"{base}-{uuid.uuid4().hex[:4]}"
    return slug


def summary(doc: dict) -> ProjectSummary:
    return ProjectSummary(**_common(doc))


def full(doc: dict, gen_chars: int = 0) -> Project:
    pointer = int(doc.get("version_pointer", 0))
    return Project(
        **_common(doc),
        html=doc.get("html", ""),
        gen_error=doc.get("gen_error", ""),
        gen_chars=gen_chars,
        can_undo=pointer > 1,
        can_redo=pointer < int(doc.get("version_count", 0)),
    )


def _common(doc: dict) -> dict:
    published = bool(doc.get("published"))
    return {
        "id": doc["id"],
        "title": doc.get("title", "Untitled app"),
        "slug": doc.get("slug", ""),
        "description": doc.get("description", ""),
        "published": published,
        "is_sample": bool(doc.get("is_sample")),
        "generating": bool(doc.get("generating")),
        "version_pointer": int(doc.get("version_pointer", 0)),
        "version_count": int(doc.get("version_count", 0)),
        "has_unpublished_changes": published and doc.get("published_html", "") != doc.get("html", ""),
        "created_at": aware(doc["created_at"]),
        "updated_at": aware(doc["updated_at"]),
        "published_at": aware(doc.get("published_at")),
    }


async def owned_project(project_id: str, user_id: str) -> dict:
    doc = await db.projects.find_one({"id": project_id, "owner_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


async def public_project(slug: str) -> dict:
    doc = await db.projects.find_one(
        {"slug": slug, "$or": [{"published": True}, {"is_sample": True}]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="App not found")
    return doc


# ---------- data layer ----------

def check_table(name: str) -> str:
    if not TABLE_RE.match(name):
        raise HTTPException(status_code=422, detail="Table names may only use letters, numbers, - and _")
    return name


def clean_data(data: dict[str, Any]) -> dict[str, Any]:
    out = {str(k)[:64]: v for k, v in data.items() if str(k) not in RESERVED and not str(k).startswith("$")}
    if len(str(out)) > 100_000:
        raise HTTPException(status_code=413, detail="Record is too large")
    return out


async def ensure_table(project_id: str, table: str, columns: list[str]) -> None:
    existing = await db.app_tables.find_one({"project_id": project_id, "name": table}, {"_id": 1})
    if not existing and await db.app_tables.count_documents({"project_id": project_id}) >= MAX_TABLES:
        raise HTTPException(status_code=409, detail="Table limit reached")
    await db.app_tables.update_one(
        {"project_id": project_id, "name": table},
        {"$setOnInsert": {"project_id": project_id, "name": table, "created_at": now()},
         "$addToSet": {"columns": {"$each": columns}}},
        upsert=True,
    )


def to_record(doc: dict) -> RecordOut:
    return RecordOut(
        id=doc["id"], table=doc["table"], data=doc.get("data", {}),
        created_at=aware(doc["created_at"]), updated_at=aware(doc["updated_at"]),
    )


async def list_tables(project_id: str) -> list[TableInfo]:
    tables = await db.app_tables.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(MAX_TABLES)
    out = []
    for t in tables:
        count = await db.records.count_documents({"project_id": project_id, "table": t["name"]})
        out.append(TableInfo(name=t["name"], columns=t.get("columns", []), count=count))
    return out


async def list_records(project_id: str, table: str) -> list[RecordOut]:
    check_table(table)
    docs = await db.records.find({"project_id": project_id, "table": table}, {"_id": 0}).sort(
        "created_at", -1).to_list(MAX_RECORDS_PER_TABLE)
    return [to_record(d) for d in docs]


async def get_record(project_id: str, table: str, record_id: str) -> RecordOut:
    doc = await db.records.find_one({"project_id": project_id, "table": table, "id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return to_record(doc)


async def insert_record(project_id: str, table: str, data: dict[str, Any]) -> RecordOut:
    check_table(table)
    data = clean_data(data)
    if await db.records.count_documents({"project_id": project_id, "table": table}) >= MAX_RECORDS_PER_TABLE:
        raise HTTPException(status_code=409, detail="Row limit reached for this table")
    await ensure_table(project_id, table, list(data.keys()))
    ts = now()
    doc = {"id": str(uuid.uuid4()), "project_id": project_id, "table": table, "data": data,
           "created_at": ts, "updated_at": ts}
    await db.records.insert_one(doc)
    return to_record(doc)


async def update_record(project_id: str, table: str, record_id: str, data: dict[str, Any]) -> RecordOut:
    check_table(table)
    data = clean_data(data)
    sets: dict[str, Any] = {f"data.{k}": v for k, v in data.items()}
    sets["updated_at"] = now()
    res = await db.records.update_one({"project_id": project_id, "table": table, "id": record_id}, {"$set": sets})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    if data:
        await ensure_table(project_id, table, list(data.keys()))
    return await get_record(project_id, table, record_id)


async def delete_record(project_id: str, table: str, record_id: str) -> None:
    res = await db.records.delete_one({"project_id": project_id, "table": table, "id": record_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")


async def copy_data(src_id: str, dst_id: str, include_records: bool = True) -> None:
    tables = await db.app_tables.find({"project_id": src_id}, {"_id": 0}).to_list(MAX_TABLES)
    for t in tables:
        await db.app_tables.insert_one({**t, "project_id": dst_id, "created_at": now()})
    if include_records:
        recs = await db.records.find({"project_id": src_id}, {"_id": 0}).to_list(20000)
        if recs:
            await db.records.insert_many([{**r, "id": str(uuid.uuid4()), "project_id": dst_id} for r in recs])
