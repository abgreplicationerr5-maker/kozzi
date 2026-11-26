import re

from fastapi import APIRouter, Depends, HTTPException

from lib import core, plans
from lib.db import db
from lib.email import owner_email
from lib.roles import current_member
from models.schemas import GalleryApp, Me, MeUpdate, Preferences, Profile
from routers.team import link_invites

router = APIRouter()


def _to_me(doc: dict, role: str) -> Me:
    return Me(
        user_id=doc["user_id"], display_name=doc.get("display_name", ""),
        workspace_name="" if doc.get("workspace_name") == "My workspace" else doc.get("workspace_name", ""),
        email=doc.get("email", ""), username=doc.get("username", ""), bio=doc.get("bio", ""),
        avatar_url=doc.get("avatar_url", ""), role=role, plan=plans.effective_plan(doc),
        preferences=Preferences(**doc.get("preferences", {})),
        created_at=core.aware(doc.get("created_at")) or core.now(),
    )


async def _unique_username(base: str, user_id: str) -> str:
    base = re.sub(r"[^a-z0-9_-]+", "", base.lower())[:24] or "maker"
    if len(base) < 3:
        base = f"{base}maker"
    name, n = base, 1
    while await db.users.find_one({"username": name, "user_id": {"$ne": user_id}}, {"_id": 1}):
        n += 1
        name = f"{base}{n}"
    return name


async def _ensure(user_id: str) -> dict:
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}
    fill = {k: v for k, v in {"display_name": "", "workspace_name": "", "bio": "", "preferences": Preferences().model_dump(),
                               "created_at": core.now()}.items() if k not in doc}
    if not doc.get("email"):
        fill["email"] = await owner_email(user_id)
    if not doc.get("username"):
        email = fill.get("email") or doc.get("email", "")
        fill["username"] = await _unique_username(doc.get("display_name") or email.split("@")[0], user_id)
    if fill:
        await db.users.update_one({"user_id": user_id}, {"$set": fill}, upsert=True)
        doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return doc


@router.get("/me", response_model=Me)
async def get_me(member: dict = Depends(current_member)):
    doc = await _ensure(member["user_id"])
    await link_invites(member["user_id"], doc.get("email", ""))
    return _to_me(doc, member["role"])


@router.patch("/me", response_model=Me)
async def update_me(body: MeUpdate, member: dict = Depends(current_member)):
    uid = member["user_id"]
    await _ensure(uid)
    sets = body.model_dump(exclude_none=True)
    if "username" in sets and await db.users.find_one({"username": sets["username"], "user_id": {"$ne": uid}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="That username is taken")
    if sets:
        await db.users.update_one({"user_id": uid}, {"$set": sets})
    return _to_me(await db.users.find_one({"user_id": uid}, {"_id": 0}), member["role"])


@router.get("/public/profiles/{username}", response_model=Profile)
async def public_profile(username: str):
    u = await db.users.find_one({"username": username.lower()}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Profile not found")
    docs = await db.projects.find(
        {"owner_id": u["user_id"], "in_gallery": True, "published": True, **core.LIVE}, {"_id": 0, "html": 0, "published_html": 0}
    ).sort("published_at", -1).to_list(60)
    apps = [GalleryApp(
        id=d["id"], title=d["title"], slug=d["slug"], description=d.get("description", ""),
        record_count=await db.records.count_documents({"project_id": d["id"], **core.LIVE}),
        owner_username=u["username"], owner_name=u.get("display_name", ""),
        updated_at=core.aware(d.get("published_at") or d["updated_at"]),
    ) for d in docs]
    return Profile(username=u["username"], display_name=u.get("display_name", ""), bio=u.get("bio", ""),
                   avatar_url=u.get("avatar_url", ""), joined_at=core.aware(u.get("created_at")) or core.now(), apps=apps)
