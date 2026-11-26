"""Enterprise enquiries (public form) and the admin area: enquiries, payments, users."""

import time
import uuid
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from lib import core, plans
from lib.db import db
from lib.email import send_enquiry_alerts
from lib.roles import IN_ENV, RANK, ROLES, effective_role, require_role
from models.schemas import (
    AdminPayment, AdminUser, AdminUsers, Enquiry, EnquiryIn, EnquiryUpdate, PlanGrantIn, RoleIn,
)

router = APIRouter()
_hits: dict[str, list[float]] = defaultdict(list)


def _limit(ip: str) -> None:
    cutoff = time.time() - 3600
    _hits[ip] = [t for t in _hits[ip] if t > cutoff]
    if len(_hits[ip]) >= 5:
        raise HTTPException(status_code=429, detail="Too many enquiries from this network. Try again later.")
    _hits[ip].append(time.time())


@router.post("/enquiries", status_code=201)
async def create_enquiry(body: EnquiryIn, request: Request, background: BackgroundTasks):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    _limit(ip)
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "email": body.email.strip().lower(), "status": "new", "created_at": core.now()}
    await db.enquiries.insert_one(doc)
    background.add_task(send_enquiry_alerts, doc)
    return {"ok": True}


@router.get("/admin/enquiries", response_model=list[Enquiry])
async def list_enquiries(_: dict = Depends(require_role("admin"))):
    docs = await db.enquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Enquiry(**{**d, "created_at": core.aware(d["created_at"])}) for d in docs]


@router.patch("/admin/enquiries/{enquiry_id}", response_model=Enquiry)
async def update_enquiry(enquiry_id: str, body: EnquiryUpdate, _: dict = Depends(require_role("admin"))):
    res = await db.enquiries.update_one({"id": enquiry_id}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    d = await db.enquiries.find_one({"id": enquiry_id}, {"_id": 0})
    return Enquiry(**{**d, "created_at": core.aware(d["created_at"])})


@router.get("/admin/payments", response_model=list[AdminPayment])
async def list_payments(_: dict = Depends(require_role("admin"))):
    docs = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = list({d.get("user_id") for d in docs if d.get("user_id")})
    emails = {u["user_id"]: u.get("email", "") for u in await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "email": 1}).to_list(len(ids) + 1)}
    return [AdminPayment(**{**d, "email": emails.get(d.get("user_id"), ""), "created_at": core.aware(d["created_at"])}) for d in docs]


# The Users page: only this environment's people, and the roles from ROLES.
@router.get("/users", response_model=AdminUsers)
async def list_users(admin: dict = Depends(require_role("admin"))):
    people = await db.users.find(IN_ENV, {"_id": 0}).to_list(1000)
    out = []
    for p in people:
        out.append(AdminUser(
            user_id=p["user_id"], email=p.get("email", ""), display_name=p.get("display_name", ""), username=p.get("username", ""),
            role=effective_role(p.get("role")), plan=plans.effective_plan(p), plan_source=p.get("plan_source", ""),
            projects=await db.projects.count_documents({"owner_id": p["user_id"], **core.LIVE}),
        ))
    return AdminUsers(roles=[r for r in ROLES if RANK[r] <= RANK[admin["role"]]], users=out)


@router.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(require_role("admin"))):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="Keep at least one admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


@router.patch("/admin/users/{user_id}/plan")
async def grant_plan(user_id: str, body: PlanGrantIn, _: dict = Depends(require_role("admin"))):
    """Grant a plan by hand (Enterprise deals, comps). Free removes an admin grant."""
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Not found")
    if body.plan == "free":
        if target.get("plan_source") != "admin":
            raise HTTPException(status_code=409, detail="This plan is paid by card. The user can cancel it on their billing page.")
        sets = {"plan": "free", "plan_source": "", "plan_status": "", "plan_period_end": None}
    else:
        end = core.now() + timedelta(days=30 * body.months) if body.months else None
        sets = {"plan": body.plan, "plan_source": "admin", "plan_status": "active", "plan_period_end": end,
                "plan_interval": "", "cancel_at_period_end": False}
    await db.users.update_one({"user_id": user_id}, {"$set": sets})
    return {"user_id": user_id, "plan": body.plan}
