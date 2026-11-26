"""Plans, limits and who-can-reach-what. The plan list is code; each user's plan is data on
their `users` doc (set by Stripe webhooks/status polling, or granted by an admin)."""

from datetime import timedelta

from fastapi import HTTPException

from lib import core
from lib.db import db

PLANS: dict[str, dict] = {
    "free": {"label": "Free", "projects": 3, "live": 1, "domains": False, "badge": True, "emails_per_day": 10, "seats": 1},
    "pro": {"label": "Pro", "projects": None, "live": 20, "domains": True, "badge": False, "emails_per_day": 100, "seats": 1},
    "team": {"label": "Team", "projects": None, "live": 100, "domains": True, "badge": False, "emails_per_day": 300, "seats": 5},
    "enterprise": {"label": "Enterprise", "projects": None, "live": None, "domains": True, "badge": False, "emails_per_day": 1000, "seats": 50},
}
# lookup_key -> (plan, interval, amount in dollars). Amounts live here and in Stripe, never in the client.
PRICES: dict[str, tuple[str, str, float]] = {
    "pro_monthly": ("pro", "month", 20.0),
    "pro_yearly": ("pro", "year", 200.0),
    "team_monthly": ("team", "month", 50.0),
    "team_yearly": ("team", "year", 500.0),
}
ACTIVE_STRIPE = {"active", "trialing", "past_due"}
GRACE = timedelta(days=3)


def effective_plan(user: dict | None) -> str:
    if not user:
        return "free"
    plan = user.get("plan") or "free"
    if plan not in PLANS or plan == "free":
        return "free"
    end = core.aware(user.get("plan_period_end"))
    if end and end + GRACE < core.now():
        return "free"
    if user.get("plan_source") == "admin":
        return plan
    return plan if user.get("plan_status") in ACTIVE_STRIPE else "free"


async def plan_for(user_id: str) -> tuple[str, dict]:
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    name = effective_plan(user)
    return name, PLANS[name]


def _upgrade(msg: str) -> HTTPException:
    return HTTPException(status_code=402, detail=msg)


async def check_project_quota(user_id: str) -> None:
    name, limits = await plan_for(user_id)
    cap = limits["projects"]
    if cap is not None and await db.projects.count_documents({"owner_id": user_id, **core.LIVE}) >= cap:
        raise _upgrade(f"The {limits['label']} plan includes {cap} projects. Upgrade to Pro for unlimited projects.")


async def check_live_quota(project: dict) -> None:
    if project.get("published"):
        return  # republishing an app that is already live never counts twice
    name, limits = await plan_for(project["owner_id"])
    cap = limits["live"]
    live = await db.projects.count_documents({"owner_id": project["owner_id"], "published": True, "id": {"$ne": project["id"]}, **core.LIVE})
    if cap is not None and live >= cap:
        raise _upgrade(f"The {limits['label']} plan includes {cap} live {'app' if cap == 1 else 'apps'}. Unpublish one or upgrade.")


async def check_domains(owner_id: str) -> None:
    _, limits = await plan_for(owner_id)
    if not limits["domains"]:
        raise _upgrade("Own domains are part of Pro and Team. Upgrade to connect a domain.")


async def emails_per_day(owner_id: str) -> int:
    return (await plan_for(owner_id))[1]["emails_per_day"]


async def shows_badge(owner_id: str) -> bool:
    return (await plan_for(owner_id))[1]["badge"]


TEAM_ROLES = ["viewer", "editor", "publisher"]
LEVEL = {"viewer": 1, "editor": 2, "publisher": 3, "owner": 4}
NEED = {"view": 1, "edit": 2, "publish": 3, "owner": 4}


async def team_owner_ids(user_id: str) -> list[str]:
    """Owners whose team this user is an active member of (and whose plan still has seats)."""
    return list((await team_roles(user_id)).keys())


async def team_roles(user_id: str) -> dict[str, str]:
    """owner_id -> this user's team role, for teams whose plan still has seats."""
    rows = await db.team_members.find({"member_user_id": user_id, "status": "active"}, {"_id": 0, "owner_id": 1, "role": 1}).to_list(100)
    out = {}
    for r in rows:
        if (await plan_for(r["owner_id"]))[1]["seats"] > 1:
            out[r["owner_id"]] = r.get("role") or "editor"
    return out


async def access_level(doc: dict, user_id: str) -> str | None:
    if doc["owner_id"] == user_id:
        return "owner"
    return (await team_roles(user_id)).get(doc["owner_id"])
