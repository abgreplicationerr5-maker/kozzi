import asyncio
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core
from lib.agent import run_agent
from lib.db import db
from lib.generator import PROGRESS
from models.schemas import (
    ChatIn, GalleryIn, Message, Project, ProjectCreate, ProjectSummary, ProjectUpdate, PublishIn, Version,
)

router = APIRouter()
_tasks: set[asyncio.Task] = set()
STALE_AFTER = timedelta(minutes=10)


def _spawn(project_id: str, text: str) -> None:
    task = asyncio.create_task(run_agent(project_id, text))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _start_generation(project: dict, text: str, add_user_message: bool = True) -> None:
    started = core.aware(project.get("gen_started_at"))
    if project.get("generating") and started and core.now() - started < STALE_AFTER:
        raise HTTPException(status_code=409, detail="Kozzi is still working on the last request")
    if add_user_message:
        await core.add_message(project["id"], "user", text, "user")
    await db.projects.update_one(
        {"id": project["id"]},
        {"$set": {"generating": True, "gen_phase": "planning", "gen_error": "", "gen_started_at": core.now(), "updated_at": core.now()}},
    )
    _spawn(project["id"], text)


async def _reload(project_id: str) -> Project:
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return core.full(doc, PROGRESS.get(project_id, 0))


async def views_by_project(ids: list[str]) -> dict[str, int]:
    rows = await db.app_visits.aggregate([
        {"$match": {"project_id": {"$in": ids}}},
        {"$group": {"_id": "$project_id", "n": {"$sum": "$count"}}},
    ]).to_list(len(ids) + 1)
    return {r["_id"]: r["n"] for r in rows}


@router.get("/projects", response_model=list[ProjectSummary])
async def list_projects(user: dict = Depends(require_user)):
    docs = await db.projects.find({"owner_id": user["user_id"], **core.LIVE}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    views = await views_by_project([d["id"] for d in docs])
    return [core.summary(d, views.get(d["id"], 0)) for d in docs]


@router.post("/projects", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate, user: dict = Depends(require_user)):
    title = body.title.strip() or "Untitled app"
    ts = core.now()
    doc = {
        "id": str(uuid.uuid4()), "owner_id": user["user_id"], "title": title,
        "title_auto": not body.title.strip(), "slug": await core.unique_slug(title if body.title.strip() else f"app-{uuid.uuid4().hex[:6]}"),
        "description": "", "html": "", "published": False, "published_html": "", "in_gallery": False,
        "version_count": 0, "version_pointer": 0, "generating": False, "gen_error": "",
        "created_at": ts, "updated_at": ts, "published_at": None, "deleted_at": None,
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
        await db.projects.update_one({"id": project_id}, {"$set": {"generating": False, "gen_phase": "", "gen_error": "Timed out"}})
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
    """Soft delete: the project leaves the dashboard and its live link, and waits in the Bin."""
    await core.owned_project(project_id, user["user_id"])
    await db.projects.update_one({"id": project_id}, {"$set": {"deleted_at": core.now()}})
    return Response(status_code=204)


@router.post("/projects/{project_id}/duplicate", response_model=Project, status_code=201)
async def duplicate_project(project_id: str, user: dict = Depends(require_user)):
    src = await db.projects.find_one(
        {"id": project_id, **core.LIVE,
         "$or": [{"owner_id": user["user_id"]}, {"in_gallery": True, "published": True}]}, {"_id": 0}
    )
    if not src:
        raise HTTPException(status_code=404, detail="Project not found")
    own = src.get("owner_id") == user["user_id"]
    html = src.get("html", "") if own else src.get("published_html", "")
    ts = core.now()
    title = f"{src['title']} copy" if own else src["title"]
    new_id = str(uuid.uuid4())
    doc = {
        "id": new_id, "owner_id": user["user_id"], "title": title, "title_auto": False,
        "slug": await core.unique_slug(title), "description": src.get("description", ""),
        "html": html, "published": False, "published_html": "", "in_gallery": False,
        "version_count": 1 if html else 0, "version_pointer": 1 if html else 0,
        "generating": False, "gen_error": "", "created_at": ts, "updated_at": ts, "published_at": None, "deleted_at": None,
    }
    await db.projects.insert_one(doc)
    if html:
        await db.versions.insert_one({
            "id": str(uuid.uuid4()), "project_id": new_id, "number": 1,
            "label": f"Copied from {src['title']}", "html": html, "created_at": ts,
        })
    await core.add_message(new_id, "assistant", f"This is a copy of {src['title']}. Tell me what to change.", "note")
    # Your own projects copy their rows; gallery apps copy only the table structure.
    await core.copy_data(project_id, new_id, include_records=own)
    return await _reload(new_id)


# ---------- chat ----------

def _kind(d: dict) -> str:
    if d.get("kind"):
        return d["kind"]
    if d.get("role") == "user":
        return "user"
    if d.get("error"):
        return "error"
    return "build" if d.get("version_number") else "note"


@router.get("/projects/{project_id}/messages", response_model=list[Message])
async def list_messages(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    docs = await db.messages.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return [Message(**{**d, "kind": _kind(d), "meta": d.get("meta") or {}, "created_at": core.aware(d["created_at"])}) for d in docs]


@router.post("/projects/{project_id}/messages", response_model=Project, status_code=202)
async def send_message(project_id: str, body: ChatIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    await _start_generation(doc, body.content.strip())
    return await _reload(project_id)


@router.post("/projects/{project_id}/retry", response_model=Project, status_code=202)
async def retry(project_id: str, user: dict = Depends(require_user)):
    """Run the most recent user request again without repeating it in the thread."""
    doc = await core.owned_project(project_id, user["user_id"])
    last = await db.messages.find_one({"project_id": project_id, "role": "user"}, {"_id": 0}, sort=[("created_at", -1)])
    if not last:
        raise HTTPException(status_code=409, detail="There is no request to retry")
    await _start_generation(doc, last["content"], add_user_message=False)
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
    new_number = await core.restore_version(doc, number)
    await core.add_message(project_id, "assistant", f"Restored version {number}. It is saved as version {new_number}.", "action",
                           meta={"action": "restore_version", "ok": True})
    return await _reload(project_id)


# ---------- publishing ----------

@router.post("/projects/{project_id}/publish", response_model=Project)
async def publish(project_id: str, body: PublishIn, user: dict = Depends(require_user)):
    doc = await core.owned_project(project_id, user["user_id"])
    await core.publish_project(doc, body.slug, body.in_gallery)
    return await _reload(project_id)


@router.post("/projects/{project_id}/unpublish", response_model=Project)
async def unpublish(project_id: str, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    await db.projects.update_one({"id": project_id}, {"$set": {"published": False, "updated_at": core.now()}})
    return await _reload(project_id)


@router.post("/projects/{project_id}/gallery", response_model=Project)
async def set_gallery(project_id: str, body: GalleryIn, user: dict = Depends(require_user)):
    await core.owned_project(project_id, user["user_id"])
    await db.projects.update_one({"id": project_id}, {"$set": {"in_gallery": body.in_gallery}})
    return await _reload(project_id)
