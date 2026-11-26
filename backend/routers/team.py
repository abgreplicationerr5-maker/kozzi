"""Teammates: Team/Enterprise owners invite people by email; once they sign in with that
email they can open and edit the owner's projects (not delete them, not billing)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from clerk_auth import require_user
from lib import core, plans
from lib.db import db
from lib.email import owner_email
from models.schemas import InviteIn, Membership, Team, TeamMember

router = APIRouter()


async def link_invites(user_id: str, email: str) -> None:
    if email:
        await db.team_members.update_many(
            {"email": email.lower(), "status": "invited", "owner_id": {"$ne": user_id}},
            {"$set": {"status": "active", "member_user_id": user_id, "joined_at": core.now()}},
        )


async def _name(user_id: str) -> tuple[str, str]:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "display_name": 1, "email": 1}) or {}
    return u.get("display_name") or u.get("email", "").split("@")[0] or "Teammate", u.get("email", "")


@router.get("/team", response_model=Team)
async def get_team(user: dict = Depends(require_user)):
    uid = user["user_id"]
    _, limits = await plans.plan_for(uid)
    rows = await db.team_members.find({"owner_id": uid}, {"_id": 0}).sort("created_at", 1).to_list(200)
    members = []
    for r in rows:
        name = (await _name(r["member_user_id"]))[0] if r.get("member_user_id") else ""
        members.append(TeamMember(id=r["id"], email=r["email"], status=r["status"], display_name=name,
                                  created_at=core.aware(r["created_at"]), joined_at=core.aware(r.get("joined_at"))))
    active_owners = set(await plans.team_owner_ids(uid))
    memberships = []
    for m in await db.team_members.find({"member_user_id": uid, "status": "active"}, {"_id": 0}).to_list(100):
        n, e = await _name(m["owner_id"])
        memberships.append(Membership(owner_id=m["owner_id"], owner_name=n, owner_email=e, active=m["owner_id"] in active_owners))
    used = 1 + len(rows)
    return Team(seats=limits["seats"], used=used, can_invite=limits["seats"] > used, members=members, memberships=memberships)


@router.post("/team/invites", response_model=Team, status_code=201)
async def invite(body: InviteIn, user: dict = Depends(require_user)):
    uid = user["user_id"]
    _, limits = await plans.plan_for(uid)
    if limits["seats"] <= 1:
        raise HTTPException(status_code=402, detail="Teammates are part of the Team plan. Upgrade to invite people.")
    email = body.email.strip().lower()
    if email == (await owner_email(uid)).lower():
        raise HTTPException(status_code=422, detail="That's your own email")
    if await db.team_members.find_one({"owner_id": uid, "email": email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="That person is already on your team")
    if 1 + await db.team_members.count_documents({"owner_id": uid}) >= limits["seats"]:
        raise HTTPException(status_code=402, detail=f"Your plan has {limits['seats']} seats and they're all used")
    doc = {"id": str(uuid.uuid4()), "owner_id": uid, "email": email, "status": "invited", "member_user_id": None,
           "created_at": core.now(), "joined_at": None}
    existing = await db.users.find_one({"email": {"$regex": f"^{email.replace('.', '[.]').replace('+', '[+]')}$", "$options": "i"}}, {"_id": 0, "user_id": 1})
    if existing and existing["user_id"] != uid:  # already has a Kozzi account: joins right away
        doc.update(status="active", member_user_id=existing["user_id"], joined_at=core.now())
    await db.team_members.insert_one(doc)
    return await get_team(user)


@router.delete("/team/members/{member_id}", status_code=204)
async def remove_member(member_id: str, user: dict = Depends(require_user)):
    res = await db.team_members.delete_one({"id": member_id, "owner_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(status_code=204)


@router.delete("/team/memberships/{owner_id}", status_code=204)
async def leave_team(owner_id: str, user: dict = Depends(require_user)):
    res = await db.team_members.delete_one({"owner_id": owner_id, "member_user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(status_code=204)
