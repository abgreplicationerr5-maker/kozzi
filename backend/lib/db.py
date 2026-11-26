"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
        IndexModel([("username", ASCENDING)], name="username", unique=True, partialFilterExpression={"username": {"$type": "string"}}),
        IndexModel([("stripe_customer_id", ASCENDING)], name="stripe_customer"),
    ],
    "projects": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("slug", ASCENDING)], name="slug", unique=True),
        IndexModel([("owner_id", ASCENDING), ("updated_at", DESCENDING)], name="owner_updated"),
        IndexModel([("in_gallery", ASCENDING), ("published", ASCENDING), ("published_at", DESCENDING)], name="gallery"),
        IndexModel([("owner_id", ASCENDING), ("deleted_at", DESCENDING)], name="owner_deleted"),
        IndexModel([("custom_domain", ASCENDING)], name="custom_domain"),
    ],
    "versions": [IndexModel([("project_id", ASCENDING), ("number", DESCENDING)], name="project_number", unique=True)],
    "messages": [IndexModel([("project_id", ASCENDING), ("created_at", ASCENDING)], name="project_created")],
    "app_tables": [IndexModel([("project_id", ASCENDING), ("name", ASCENDING)], name="project_name", unique=True)],
    "records": [
        IndexModel([("project_id", ASCENDING), ("table", ASCENDING), ("created_at", DESCENDING)], name="project_table_created"),
        IndexModel([("project_id", ASCENDING), ("table", ASCENDING), ("id", ASCENDING)], name="project_table_id", unique=True),
        IndexModel([("id", ASCENDING)], name="id"),
        IndexModel([("project_id", ASCENDING), ("deleted_batch", ASCENDING)], name="project_batch"),
    ],
    "app_visits": [IndexModel([("project_id", ASCENDING), ("day", ASCENDING)], name="project_day", unique=True)],
    "emails": [
        IndexModel([("project_id", ASCENDING), ("day", ASCENDING)], name="project_day"),
        IndexModel([("project_id", ASCENDING), ("created_at", DESCENDING)], name="project_created"),
        IndexModel([("project_id", ASCENDING), ("record_id", ASCENDING)], name="project_record"),
        IndexModel([("owner_id", ASCENDING), ("created_at", DESCENDING)], name="owner_created"),
        IndexModel([("status", ASCENDING), ("created_at", ASCENDING)], name="status_created"),
        IndexModel([("id", ASCENDING)], name="id"),
    ],
    "team_members": [
        IndexModel([("owner_id", ASCENDING), ("email", ASCENDING)], name="owner_email", unique=True),
        IndexModel([("member_user_id", ASCENDING), ("status", ASCENDING)], name="member_status"),
        IndexModel([("email", ASCENDING), ("status", ASCENDING)], name="email_status"),
    ],
    "payment_transactions": [IndexModel([("session_id", ASCENDING)], name="session_id", unique=True),
                             IndexModel([("created_at", DESCENDING)], name="created")],
    "enquiries": [IndexModel([("created_at", DESCENDING)], name="created")],
    "cron_runs": [IndexModel([("run_id", ASCENDING)], name="run_id", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
