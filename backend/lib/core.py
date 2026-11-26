"""Shared helpers: project serialization, ownership checks, publishing/versions, and the
flexible per-project table/record data layer used by the builder, the agent and hosted apps.

Nothing here hard-deletes: projects, tables and rows get a `deleted_at` stamp and move to
the Bin, where they can be restored for 30 days."""

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from lib.db import db
from models.schemas import Project, ProjectSummary, RecordOut, TableInfo

TABLE_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_RECORDS_PER_TABLE = 5000
MAX_TABLES = 50
RESERVED = {"id", "created_at", "updated_at"}
LIVE = {"deleted_at": None}  # matches documents that were never deleted (field missing or null)
BIN_DAYS = 30


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def bin_cutoff() -> datetime:
    return now() - timedelta(days=BIN_DAYS)


def tidy(text: str) -> str:
    """House style for anything Kozzi writes to users: no em or en dashes."""
    return text.replace(" \u2014 ", ", ").replace("\u2014", ", ").replace(" \u2013 ", " to ").replace("\u2013", "-")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:40].strip("-") or "app"


async def unique_slug(base: str) -> str:
    base = slugify(base)
    slug = base
    while await db.projects.find_one({"slug": slug}, {"_id": 1}):
        slug = f"{base}-{uuid.uuid4().hex[:4]}"
    return slug


def summary(doc: dict, views: int = 0, user_id: str | None = None, shared_by: str = "") -> ProjectSummary:
    return ProjectSummary(**_common(doc), views=views, is_owner=user_id is None or doc["owner_id"] == user_id, shared_by=shared_by)


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
        "in_gallery": bool(doc.get("in_gallery")),
        "generating": bool(doc.get("generating")),
        "gen_phase": doc.get("gen_phase", "") if doc.get("generating") else "",
        "version_pointer": int(doc.get("version_pointer", 0)),
        "version_count": int(doc.get("version_count", 0)),
        "has_unpublished_changes": published and doc.get("published_html", "") != doc.get("html", ""),
        "custom_domain": doc.get("custom_domain", ""),
        "domain_status": doc.get("domain_status", ""),
        "domain_detail": doc.get("domain_detail", ""),
        "domain_checked_at": aware(doc.get("domain_checked_at")),
        "created_at": aware(doc["created_at"]),
        "updated_at": aware(doc["updated_at"]),
        "published_at": aware(doc.get("published_at")),
    }


async def owned_project(project_id: str, user_id: str, owner_only: bool = False) -> dict:
    """The project if this user owns it, or (unless owner_only) is on the owner's team."""
    from lib.plans import can_edit  # local import: plans imports core

    doc = await db.projects.find_one({"id": project_id, **LIVE}, {"_id": 0})
    if not doc or (doc["owner_id"] != user_id and (owner_only or not await can_edit(doc, user_id))):
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


async def public_project(slug: str) -> dict:
    doc = await db.projects.find_one({"slug": slug, "published": True, **LIVE}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="App not found")
    return doc


async def add_message(project_id: str, role: str, content: str, kind: str = "note",
                      version_number: int | None = None, meta: dict | None = None) -> None:
    await db.messages.insert_one({
        "id": str(uuid.uuid4()), "project_id": project_id, "role": role,
        "content": tidy(content) if role == "assistant" else content, "kind": kind,
        "version_number": version_number, "error": kind == "error", "meta": meta or {}, "created_at": now(),
    })


# ---------- publishing + versions (shared by routes and the chat agent) ----------

async def publish_project(doc: dict, slug: str, in_gallery: bool | None = None) -> str:
    if not doc.get("html"):
        raise HTTPException(status_code=409, detail="Build something before publishing")
    if not SLUG_RE.match(slug) or not 2 <= len(slug) <= 60:
        raise HTTPException(status_code=422, detail="Use lowercase letters, numbers and single dashes for the link")
    if await db.projects.find_one({"slug": slug, "id": {"$ne": doc["id"]}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="That link is already taken")
    ts = now()
    sets: dict[str, Any] = {"slug": slug, "published": True, "published_html": doc["html"], "published_at": ts, "updated_at": ts}
    if in_gallery is not None:
        sets["in_gallery"] = in_gallery
    await db.projects.update_one({"id": doc["id"]}, {"$set": sets})
    return slug


async def restore_version(doc: dict, number: int) -> int:
    v = await db.versions.find_one({"project_id": doc["id"], "number": number}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    latest = await db.projects.find_one({"id": doc["id"]}, {"_id": 0, "version_count": 1})
    new_number = int((latest or doc).get("version_count", 0)) + 1
    ts = now()
    await db.versions.insert_one({
        "id": str(uuid.uuid4()), "project_id": doc["id"], "number": new_number,
        "label": f"Restored version {number}", "html": v["html"], "created_at": ts,
    })
    await db.projects.update_one({"id": doc["id"]}, {"$set": {
        "html": v["html"], "version_count": new_number, "version_pointer": new_number, "updated_at": ts}})
    return new_number


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
    existing = await db.app_tables.find_one({"project_id": project_id, "name": table, **LIVE}, {"_id": 1})
    if not existing and await db.app_tables.count_documents({"project_id": project_id, **LIVE}) >= MAX_TABLES:
        raise HTTPException(status_code=409, detail="Table limit reached")
    # Writing to a table that sits in the Bin brings it back (its old rows stay in the Bin).
    await db.app_tables.update_one(
        {"project_id": project_id, "name": table},
        {"$setOnInsert": {"project_id": project_id, "name": table, "created_at": now()},
         "$set": {"deleted_at": None, "deleted_batch": None},
         "$addToSet": {"columns": {"$each": columns}}},
        upsert=True,
    )


def to_record(doc: dict) -> RecordOut:
    return RecordOut(
        id=doc["id"], table=doc["table"], data=doc.get("data", {}),
        created_at=aware(doc["created_at"]), updated_at=aware(doc["updated_at"]),
    )


async def list_tables(project_id: str) -> list[TableInfo]:
    tables = await db.app_tables.find({"project_id": project_id, **LIVE}, {"_id": 0}).sort("created_at", 1).to_list(MAX_TABLES)
    out = []
    for t in tables:
        count = await db.records.count_documents({"project_id": project_id, "table": t["name"], **LIVE})
        out.append(TableInfo(name=t["name"], columns=t.get("columns", []), count=count))
    return out


async def list_records(project_id: str, table: str) -> list[RecordOut]:
    check_table(table)
    docs = await db.records.find({"project_id": project_id, "table": table, **LIVE}, {"_id": 0}).sort(
        "created_at", -1).to_list(MAX_RECORDS_PER_TABLE)
    return [to_record(d) for d in docs]


async def get_record(project_id: str, table: str, record_id: str) -> RecordOut:
    doc = await db.records.find_one({"project_id": project_id, "table": table, "id": record_id, **LIVE}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return to_record(doc)


async def insert_record(project_id: str, table: str, data: dict[str, Any]) -> RecordOut:
    check_table(table)
    data = clean_data(data)
    if await db.records.count_documents({"project_id": project_id, "table": table, **LIVE}) >= MAX_RECORDS_PER_TABLE:
        raise HTTPException(status_code=409, detail="Row limit reached for this table")
    await ensure_table(project_id, table, list(data.keys()))
    ts = now()
    doc = {"id": str(uuid.uuid4()), "project_id": project_id, "table": table, "data": data,
           "created_at": ts, "updated_at": ts, "deleted_at": None}
    await db.records.insert_one(doc)
    return to_record(doc)


async def update_record(project_id: str, table: str, record_id: str, data: dict[str, Any]) -> RecordOut:
    check_table(table)
    data = clean_data(data)
    sets: dict[str, Any] = {f"data.{k}": v for k, v in data.items()}
    sets["updated_at"] = now()
    res = await db.records.update_one({"project_id": project_id, "table": table, "id": record_id, **LIVE}, {"$set": sets})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    if data:
        await ensure_table(project_id, table, list(data.keys()))
    return await get_record(project_id, table, record_id)


async def delete_record(project_id: str, table: str, record_id: str) -> None:
    res = await db.records.update_one(
        {"project_id": project_id, "table": table, "id": record_id, **LIVE},
        {"$set": {"deleted_at": now(), "deleted_batch": None}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")


async def delete_table(project_id: str, table: str) -> int:
    batch = str(uuid.uuid4())
    ts = now()
    res = await db.app_tables.update_one(
        {"project_id": project_id, "name": table, **LIVE}, {"$set": {"deleted_at": ts, "deleted_batch": batch}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    moved = await db.records.update_many(
        {"project_id": project_id, "table": table, **LIVE}, {"$set": {"deleted_at": ts, "deleted_batch": batch}})
    return moved.modified_count


async def copy_data(src_id: str, dst_id: str, include_records: bool = True) -> None:
    tables = await db.app_tables.find({"project_id": src_id, **LIVE}, {"_id": 0}).to_list(MAX_TABLES)
    for t in tables:
        await db.app_tables.insert_one({**t, "project_id": dst_id, "created_at": now()})
    if include_records:
        recs = await db.records.find({"project_id": src_id, **LIVE}, {"_id": 0}).to_list(20000)
        if recs:
            await db.records.insert_many([{**r, "id": str(uuid.uuid4()), "project_id": dst_id} for r in recs])
