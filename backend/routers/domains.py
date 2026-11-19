"""Own-domain support for live apps.

Emergent hosting serves one custom domain per deployment, so a user's domain reaches
their app by forwarding at the registrar (301/302 redirect, or masked/framed forwarding)
to the app's Kozzi link. Kozzi stores the domain and checks for real that it forwards
to the right app."""

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from clerk_auth import require_user
from lib import core
from lib.db import db
from models.schemas import DomainIn, Project
from routers.projects import _reload

router = APIRouter()

DOMAIN_RE = re.compile(r"^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
MAX_HOPS = 6


def normalize(raw: str) -> str:
    d = raw.strip().lower()
    d = re.sub(r"^[a-z]+://", "", d).split("/")[0].split("?")[0].split(":")[0].rstrip(".")
    if not DOMAIN_RE.match(d):
        raise HTTPException(status_code=422, detail="Enter a domain like app.example.com")
    return d


def kozzi_host(request: Request) -> str:
    return (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip().split(":")[0].lower()


async def _public_ip(host: str) -> bool:
    """Only fetch hosts that resolve to public addresses (no SSRF into the pod or LAN)."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    ips = {i[4][0] for i in infos}
    return bool(ips) and all(ipaddress.ip_address(ip).is_global for ip in ips)


def _targets(url: str, host: str, slug: str) -> bool:
    u = urlparse(url)
    return (u.hostname or "").lower() == host and u.path.rstrip("/") == f"/app/{slug}"


async def check_domain(domain: str, host: str, slug: str) -> tuple[str, str]:
    """Returns (status, detail). status: connected | failed."""
    if not await _public_ip(domain):
        return "failed", f"{domain} doesn't point to a public address yet. DNS changes can take up to an hour."
    frame_re = re.compile(rf"""(?:src|href|url)\s*=\s*["']?(https?://{re.escape(host)}/app/{re.escape(slug)})/?["'\s>]""", re.I)
    last = ""
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}/"
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=False, headers={"User-Agent": "KozziDomainCheck/1.0"}) as client:
                for _ in range(MAX_HOPS):
                    if _targets(url, host, slug):
                        return "connected", f"{domain} forwards to /app/{slug}."
                    target = urlparse(url).hostname or ""
                    if target != host and not await _public_ip(target):
                        return "failed", f"{domain} forwards to an address Kozzi can't reach."
                    r = await client.get(url)
                    if r.is_redirect and r.headers.get("location"):
                        url = urljoin(url, r.headers["location"])
                        continue
                    if r.status_code == 200 and frame_re.search(r.text[:200_000]):
                        return "connected", f"{domain} shows /app/{slug} with masked forwarding."
                    last = f"{domain} answered with status {r.status_code} but doesn't forward to /app/{slug} yet."
                    break
                else:
                    last = f"{domain} redirects too many times."
        except httpx.HTTPError:
            last = last or f"Couldn't connect to {domain} yet."
    return "failed", last or f"{domain} doesn't forward to /app/{slug} yet."


async def _owned_live(project_id: str, user: dict) -> dict:
    return await core.owned_project(project_id, user["user_id"])


@router.put("/projects/{project_id}/domain", response_model=Project)
async def set_domain(project_id: str, body: DomainIn, user: dict = Depends(require_user)):
    await _owned_live(project_id, user)
    domain = normalize(body.domain)
    if await db.projects.find_one({"custom_domain": domain, "id": {"$ne": project_id}, **core.LIVE}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="That domain is already connected to another app")
    await db.projects.update_one({"id": project_id}, {"$set": {
        "custom_domain": domain, "domain_status": "pending", "domain_detail": "", "domain_checked_at": None}})
    return await _reload(project_id)


@router.delete("/projects/{project_id}/domain", response_model=Project)
async def remove_domain(project_id: str, user: dict = Depends(require_user)):
    await _owned_live(project_id, user)
    await db.projects.update_one({"id": project_id}, {"$set": {
        "custom_domain": "", "domain_status": "", "domain_detail": "", "domain_checked_at": None}})
    return await _reload(project_id)


@router.post("/projects/{project_id}/domain/check", response_model=Project)
async def verify_domain(project_id: str, request: Request, user: dict = Depends(require_user)):
    doc = await _owned_live(project_id, user)
    domain = doc.get("custom_domain")
    if not domain:
        raise HTTPException(status_code=409, detail="Add a domain first")
    if not doc.get("published"):
        status, detail = "failed", "Publish the app first so the forwarding has something to point at."
    else:
        status, detail = await check_domain(domain, kozzi_host(request), doc["slug"])
    await db.projects.update_one({"id": project_id}, {"$set": {
        "domain_status": status, "domain_detail": detail, "domain_checked_at": core.now()}})
    return await _reload(project_id)
