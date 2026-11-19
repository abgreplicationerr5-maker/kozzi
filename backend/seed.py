"""Seed the public sample gallery by building each sample app with Kozzi's own
generator. Idempotent: samples that already have code are skipped.
Run: cd /app/backend && python seed.py"""

import asyncio
import uuid

from lib import core
from lib.db import db, ensure_indexes
from lib.generator import run_generation

SAMPLES = [
    ("client-tracker", "Client Tracker",
     "A client tracker for a freelancer: add clients with name, company, email, status (lead, active, paused, done) and deal value. "
     "Searchable, filterable table with status pills, inline status change, edit and delete, and summary stats (active clients, pipeline value)."),
    ("habit-log", "Habit Log",
     "A daily habit tracker: create habits with a name, emoji and colour, check them off for today, see a 7-day grid per habit, "
     "current streaks and a weekly completion percentage. Store habits and check_ins tables."),
    ("event-rsvp", "Event RSVP",
     "An elegant RSVP page for a community dinner event: event details header, an RSVP form (name, email, attending yes/no/maybe, guests count, dietary notes), "
     "a live guest list with counts by response, and a host view to filter and remove responses."),
    ("inventory-manager", "Inventory Manager",
     "An inventory manager for a small shop: products with name, SKU, category, quantity, reorder level and price. "
     "Low-stock highlighting, quick +/- stock buttons, category filter, search, total stock value, and a CSV export button."),
]


async def ensure_sample(slug: str, title: str, prompt: str) -> None:
    doc = await db.projects.find_one({"slug": slug}, {"_id": 0})
    if doc and doc.get("html"):
        print(f"skip {slug}")
        return
    if not doc:
        ts = core.now()
        doc = {
            "id": str(uuid.uuid4()), "owner_id": "kozzi-samples", "title": title, "title_auto": False,
            "slug": slug, "description": "", "html": "", "published": True, "published_html": "",
            "is_sample": True, "version_count": 0, "version_pointer": 0, "generating": True, "gen_error": "",
            "created_at": ts, "updated_at": ts, "published_at": ts,
        }
        await db.projects.insert_one(doc)
        await db.messages.insert_one({"id": str(uuid.uuid4()), "project_id": doc["id"], "role": "user",
                                      "content": prompt, "version_number": None, "error": False, "created_at": ts})
    print(f"building {slug}…")
    await run_generation(doc["id"], prompt)
    fresh = await db.projects.find_one({"id": doc["id"]}, {"_id": 0})
    await db.projects.update_one({"id": doc["id"]}, {"$set": {"published_html": fresh.get("html", ""), "published": True}})
    print(f"done {slug}: {len(fresh.get('html', ''))} chars {fresh.get('gen_error', '')}")


async def main() -> None:
    await ensure_indexes()
    for s in SAMPLES:  # sequential: the LLM key allows one request at a time
        await ensure_sample(*s)


if __name__ == "__main__":
    asyncio.run(main())
