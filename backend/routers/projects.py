import asyncio
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core
from lib.db import db
from lib.generator import PROGRESS, run_generation
from models.schemas import (
    ChatIn, Message, Project, ProjectCreate, ProjectSummary, ProjectUpdate, PublishIn, Version,
)

router = APIRouter()
_tasks: set[asyncio.Task] = set()
STALE_AFTER = timedelta(minutes=8)


def _spawn(project_id: str, text: str) -> None:
    task = asyncio.create_task(run_generation(project_id, text))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _add_message(project_id: str, role: str, content: str) -> None:
    await db.messages.insert_one({
        "id": str(uuid.uuid4()), "project_id": project_id, "role": role, "content": content,
        "version_number": None, "error": False, "created_at": core.now(),
    })


async def _start_generation(project: dict, text: str) -> None:
    started = core.aware(project.get("gen_started_at"))
    if project.get("generating") and started and core.now() - started < STALE_AFTER:
        raise HTTPException(status_code=409, detail="Kozzi is still working on the last request")
    await _add_message(project["id"], "user", text)
    await db.projects.update_one(
        {"id": project["id"]},
        {"$set": {"generating": True, "gen_error": "", "gen_started_at": core.now(), "updated_at": core.now()}},
    )
    _spawn(project["id"], text)


async def _reload(project_id: str) -> Project:
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return core.full(doc, PROGRESS.get(project_id, 0))


@router.get("/projects", response_model=list[ProjectSummary])
async def list_projects(user: dict = Depends(require_user)):
    docs = await db.projects.find({"owner_id": user["user_id"]}, {"_id": 0, "html": 0, "published_html": 0}).sort(
        "updated_at", -1).to_list(500)
    # summary() compares html vs published_html; re-fetch the flag cheaply via a projection
    flags = {
        d["id"]: d.get("published_html", "") != d.get("html", "")
        for d in await db.projects.find(
            {"owner_id": user["user_id"], "published": True}, {"_id": 0, "id": 1, "html": 1, "published_html": 1}
        ).to_list(500)
    }
    out = []
    for d in docs:
        s = core.summary(d)
        s.has_unpublished_changes = flags.get(d["id"], False)
        out.append(s)
    return out


@router.post("/projects", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate, user: dict = Depends(require_user)):
    title = body.title.strip() or "Untitled app"
    ts = core.now()
    doc = {
        "id": str(uuid.uuid4()), "owner_id": user["user_id"], "title": title,
        "title_auto": not body.title.strip(), "slug": await core.unique_slug(title if body.title.strip() else f"app-{uuid.uuid4().hex[:6]}"),
        "description": "", "html": "", "published": False, "published_html": "", "is_sample": False,
        "version_count": 0, "version_pointer": 0, "generating": False, "gen_error": "",
        "created_at": ts, "updated_at": ts, "published_at": None,
    }
    await db.projects.insert_one(doc)
    if body.prompt.strip():
        await _start_generation(doc, body.prompt.strip())
    return await _reload(doc["id"])


@router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    started = core.aware(doc.get("gen_started_at"))
    if doc.get("generating") and project_id not in PROGRESS and started and core.now() - started > STALE_AFTER:
        await db.projects.update_one({"id": project_id}, {"$set": {"generating": False, "gen_error": "Timed out"}})
    return await _reload(project_id)


@router.patch("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectUpdate, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    sets = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    if "title" in sets:
        sets["title_auto"] = False
    if sets:
        sets["updated_at"] = core.now()
        await db.projects.update_one({"id": project_id}, {"$set": sets})
    return await _reload(project_id)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    for coll in ("versions", "messages", "app_tables", "records"):
        await db[coll].delete_many({"project_id": project_id})
    await db.projects.delete_one({"id": project_id})
    return Response(status_code=204)


@router.post("/projects/{project_id}/duplicate", response_model=Project, status_code=201)
async def duplicate_project(project_id: str, user: dict = Depends(require_user)):
    src = await db.projects.find_one(
        {"id": project_id, "$or": [{"owner_id": user["user_id"]}, {"is_sample": True}]}, {"_id": 0}
    )
    if not src:
        raise HTTPException(status_code=404, detail="Project not found")
    ts = core.now()
    title = f"{src['title']} copy" if src.get("owner_id") == user["user_id"] else src["title"]
    new_id = str(uuid.uuid4())
    doc = {
        "id": new_id, "owner_id": user["user_id"], "title": title, "title_auto": False,
        "slug": await core.unique_slug(title), "description": src.get("description", ""),
        "html": src.get("html", ""), "published": False, "published_html": "", "is_sample": False,
        "version_count": 1 if src.get("html") else 0, "version_pointer": 1 if src.get("html") else 0,
        "generating": False, "gen_error": "", "created_at": ts, "updated_at": ts, "published_at": None,
    }
    await db.projects.insert_one(doc)
    if src.get("html"):
        await db.versions.insert_one({
            "id": str(uuid.uuid4()), "project_id": new_id, "number": 1,
            "label": f"Duplicated from {src['title']}", "html": src["html"], "created_at": ts,
        })
    await _add_message(new_id, "assistant", f"This project is a copy of “{src['title']}”. Tell me what you'd like to change.")
    # Own projects copy their live rows; samples copy only the table structure so you start clean.
    await core.copy_data(project_id, new_id, include_records=src.get("owner_id") == user["user_id"])
    return await _reload(new_id)


# ---------- chat ----------

@router.get("/projects/{project_id}/messages", response_model=list[Message])
async def list_messages(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    docs = await db.messages.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [Message(**{**d, "created_at": core.aware(d["created_at"])}) for d in docs]


@router.post("/projects/{project_id}/messages", response_model=Project, status_code=202)
async def send_message(project_id: str, body: ChatIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    await _start_generation(doc, body.content.strip())
    return await _reload(project_id)


# ---------- versions ----------

@router.get("/projects/{project_id}/versions", response_model=list[Version])
async def list_versions(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    docs = await db.versions.find({"project_id": project_id}, {"_id": 0, "html": 0}).sort("number", -1).to_list(500)
    return [Version(**{**d, "created_at": core.aware(d["created_at"])}) for d in docs]


async def _move_to(project_id: str, number: int) -> Project:
    v = await db.versions.find_one({"project_id": project_id, "number": number}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    await db.projects.update_one(
        {"id": project_id}, {"$set": {"html": v["html"], "version_pointer": number, "updated_at": core.now()}}
    )
    return await _reload(project_id)


@router.post("/projects/{project_id}/undo", response_model=Project)
async def undo(project_id: str, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    if doc.get("version_pointer", 0) <= 1:
        raise HTTPException(status_code=409, detail="Nothing to undo")
    return await _move_to(project_id, doc["version_pointer"] - 1)


@router.post("/projects/{project_id}/redo", response_model=Project)
async def redo(project_id: str, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    if doc.get("version_pointer", 0) >= doc.get("version_count", 0):
        raise HTTPException(status_code=409, detail="Nothing to redo")
    return await _move_to(project_id, doc["version_pointer"] + 1)


@router.post("/projects/{project_id}/versions/{number}/restore", response_model=Project)
async def restore_version(project_id: str, number: int, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    v = await db.versions.find_one({"project_id": project_id, "number": number}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    new_number = int(doc.get("version_count", 0)) + 1
    ts = core.now()
    await db.versions.insert_one({
        "id": str(uuid.uuid4()), "project_id": project_id, "number": new_number,
        "label": f"Restored version {number}", "html": v["html"], "created_at": ts,
    })
    await db.projects.update_one({"id": project_id}, {"$set": {
        "html": v["html"], "version_count": new_number, "version_pointer": new_number, "updated_at": ts}})
    await _add_message(project_id, "assistant", f"Restored version {number}. It's saved as version {new_number}.")
    return await _reload(project_id)


# ---------- publishing ----------

@router.post("/projects/{project_id}/publish", response_model=Project)
async def publish(project_id: str, body: PublishIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    if not doc.get("html"):
        raise HTTPException(status_code=409, detail="Build something before publishing")
    taken = await db.projects.find_one({"slug": body.slug, "id": {"$ne": project_id}}, {"_id": 1})
    if taken:
        raise HTTPException(status_code=409, detail="That link is already taken")
    ts = core.now()
    await db.projects.update_one({"id": project_id}, {"$set": {
        "slug": body.slug, "published": True, "published_html": doc["html"], "published_at": ts, "updated_at": ts}})
    return await _reload(project_id)


@router.post("/projects/{project_id}/unpublish", response_model=Project)
async def unpublish(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    await db.projects.update_one({"id": project_id}, {"$set": {"published": False, "updated_at": core.now()}})
    return await _reload(project_id)
