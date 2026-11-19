"""The Bin: soft-deleted projects, tables and rows from the last 30 days, with restore."""

import json

from fastapi import APIRouter, Depends, HTTPException

from clerk_auth import require_user
from lib import core
from lib.db import db
from models.schemas import Trash, TrashProject, TrashRecord, TrashTable

router = APIRouter()


def _preview(data: dict) -> str:
    parts = [str(v) for v in data.values() if isinstance(v, (str, int, float)) and str(v).strip()]
    return (", ".join(parts) or json.dumps(data, default=str))[:140]


@router.get("/trash", response_model=Trash)
async def list_trash(user: dict = Depends(require_user)):
    cutoff = core.bin_cutoff()
    owner = user["user_id"]
    deleted = await db.projects.find(
        {"owner_id": owner, "deleted_at": {"$gte": cutoff}}, {"_id": 0, "id": 1, "title": 1, "deleted_at": 1}
    ).sort("deleted_at", -1).to_list(200)
    live = await db.projects.find({"owner_id": owner, **core.LIVE}, {"_id": 0, "id": 1, "title": 1}).to_list(500)
    titles = {p["id"]: p["title"] for p in live}
    ids = list(titles)
    tables = await db.app_tables.find(
        {"project_id": {"$in": ids}, "deleted_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("deleted_at", -1).to_list(200)
    out_tables = [
        TrashTable(
            project_id=t["project_id"], project_title=titles[t["project_id"]], name=t["name"],
            rows=await db.records.count_documents({"project_id": t["project_id"], "deleted_batch": t.get("deleted_batch") or "-"}),
            deleted_at=core.aware(t["deleted_at"]),
        )
        for t in tables
    ]
    records = await db.records.find(
        {"project_id": {"$in": ids}, "deleted_at": {"$gte": cutoff}, "deleted_batch": None}, {"_id": 0}
    ).sort("deleted_at", -1).to_list(300)
    return Trash(
        projects=[TrashProject(id=p["id"], title=p["title"], deleted_at=core.aware(p["deleted_at"])) for p in deleted],
        tables=out_tables,
        records=[
            TrashRecord(id=r["id"], project_id=r["project_id"], project_title=titles[r["project_id"]], table=r["table"],
                        preview=_preview(r.get("data", {})), deleted_at=core.aware(r["deleted_at"]))
            for r in records
        ],
    )


@router.post("/trash/projects/{project_id}/restore", status_code=204)
async def restore_project(project_id: str, user: dict = Depends(require_user)):
    res = await db.projects.update_one(
        {"id": project_id, "owner_id": user["user_id"], "deleted_at": {"$ne": None}},
        {"$set": {"deleted_at": None, "updated_at": core.now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nothing to restore")


@router.post("/trash/projects/{project_id}/tables/{table}/restore", status_code=204)
async def restore_table(project_id: str, table: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    t = await db.app_tables.find_one({"project_id": project_id, "name": table, "deleted_at": {"$ne": None}}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Nothing to restore")
    await db.app_tables.update_one({"project_id": project_id, "name": table}, {"$set": {"deleted_at": None, "deleted_batch": None}})
    if t.get("deleted_batch"):
        await db.records.update_many(
            {"project_id": project_id, "deleted_batch": t["deleted_batch"]}, {"$set": {"deleted_at": None, "deleted_batch": None}})


@router.post("/trash/records/{record_id}/restore", status_code=204)
async def restore_record(record_id: str, user: dict = Depends(require_user)):
    r = await db.records.find_one({"id": record_id, "deleted_at": {"$ne": None}}, {"_id": 0, "project_id": 1, "table": 1})
    if not r:
        raise HTTPException(status_code=404, detail="Nothing to restore")
    await core.owned_project(r["project_id"], user["user_id"])
    await core.ensure_table(r["project_id"], r["table"], [])
    await db.records.update_one({"id": record_id, "project_id": r["project_id"]}, {"$set": {"deleted_at": None, "deleted_batch": None}})
