from fastapi import APIRouter, Depends
from pymongo import ReturnDocument

from clerk_auth import require_user
from lib import core
from lib.db import db
from lib.email import owner_email
from models.schemas import Me, MeUpdate, Preferences

router = APIRouter()


def _to_me(doc: dict) -> Me:
    return Me(
        user_id=doc["user_id"], display_name=doc.get("display_name", ""),
        workspace_name="" if doc.get("workspace_name") == "My workspace" else doc.get("workspace_name", ""),
        email=doc.get("email", ""),
        preferences=Preferences(**doc.get("preferences", {})),
        created_at=core.aware(doc["created_at"]),
    )


async def _ensure(user_id: str) -> dict:
    return await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$setOnInsert": {"user_id": user_id, "display_name": "", "workspace_name": "",
                          "preferences": Preferences().model_dump(), "created_at": core.now()}},
        upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )


@router.get("/me", response_model=Me)
async def get_me(user: dict = Depends(require_user)):
    doc = await _ensure(user["user_id"])
    if not doc.get("email"):
        doc["email"] = await owner_email(user["user_id"])
    return _to_me(doc)


@router.patch("/me", response_model=Me)
async def update_me(body: MeUpdate, user: dict = Depends(require_user)):
    await _ensure(user["user_id"])
    sets = body.model_dump(exclude_none=True)
    if sets:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": sets})
    return _to_me(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))
