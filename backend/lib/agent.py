"""The Kozzi chat agent. One user request becomes several short assistant messages:

1. a plan message (what Kozzi is about to do),
2. one message per command it runs (data, project and email commands),
3. a build message when the app's code changes (saved as a new version).

The planning step is a small JSON-only LLM call; the build step is the full code
generator. Everything runs as one background task per project."""

import json
import logging
from typing import Any

from fastapi import HTTPException

from lib import core, email, plans
from lib.db import db
from lib.generator import build_code, llm_chat, stream_text

logger = logging.getLogger(__name__)

MAX_ROWS_PER_ACTION = 50
AFTER_BUILD = {"publish", "send_email"}

PLANNER_PROMPT = """You are Kozzi, the assistant inside a web app builder. You turn one user request into a short plan of concrete steps. You do not write app code yourself; a separate build step does that when you set "build": true.

Reply with ONLY one JSON object, no prose, no code fences:
{
  "reply": "1-2 short plain sentences telling the user what you are about to do",
  "actions": [ ...zero or more commands... ],
  "build": true or false,
  "build_brief": "when build is true: precise instructions for the code change, include every detail from the request"
}

Commands you can run (run in the listed order; publish and send_email always run after the build):
{"type":"create_table","table":"snake_case_name","columns":["field_a","field_b"]}
{"type":"add_rows","table":"name","rows":[{"field":"value"}]}             at most 50 rows
{"type":"update_rows","table":"name","where":{"field":"value"},"set":{"field":"new value"}}   where {} means every row
{"type":"delete_rows","table":"name","where":{"field":"value"}}            rows move to the Bin, where {} means every row
{"type":"delete_table","table":"name"}                                    moves the table and its rows to the Bin
{"type":"rename_project","title":"New title"}
{"type":"publish","slug":"optional-link-slug"}                            pushes the latest version live at /app/<slug>
{"type":"unpublish"}
{"type":"restore_version","number":3}
{"type":"send_email","subject":"Short subject","body":"Plain text. Short paragraphs, '- ' bullets allowed."}   always delivered to the signed-in user's own email

Rules:
- build is true whenever the request needs any change to how the app looks or behaves, or when the app has no code yet. Pure data, project or email requests use build false.
- Use the existing table names and field names from the snapshot so the app keeps reading its data.
- When asked for sample, test or starter rows, add realistic, varied rows that match the app's fields (never lorem ipsum).
- For an email summary, write the actual numbers and facts from the data snapshot into the body. Emails can only go to the user themself; if they ask to email someone else, say so in reply and skip it.
- Only run delete commands when the user clearly asks to delete or clear something.
- Write like a calm senior engineer: plain words, no hype, no em dashes, no emoji."""


def _snapshot_rows(rows: list[dict], limit: int = 15) -> list[dict]:
    return [{**r.get("data", {}), "id": r["id"]} for r in rows[:limit]]


async def _context(project: dict, request: str) -> str:
    pid = project["id"]
    tables = await core.list_tables(pid)
    snap: dict[str, Any] = {}
    for t in tables:
        rows = await db.records.find({"project_id": pid, "table": t.name, **core.LIVE}, {"_id": 0}).sort(
            "created_at", -1).to_list(15)
        snap[t.name] = {"columns": t.columns, "row_count": t.count, "latest_rows": _snapshot_rows(rows)}
    data_json = json.dumps(snap, default=str)[:9000]
    history = await db.messages.find({"project_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(14)
    history.reverse()
    convo = "\n".join(f"{m['role'].upper()}: {m['content'][:600]}" for m in history[:-1]) or "(none)"
    html = project.get("html") or ""
    return (
        f"PROJECT: title={project.get('title')!r}, link=/app/{project.get('slug')}, "
        f"published={bool(project.get('published'))}, versions={project.get('version_count', 0)} "
        f"(current {project.get('version_pointer', 0)}), has_code={bool(html)}, code_size={len(html)} chars\n"
        f"DESCRIPTION: {project.get('description') or '(none)'}\n\n"
        f"DATA SNAPSHOT (JSON):\n{data_json or '{}'}\n\n"
        f"CONVERSATION SO FAR:\n{convo}\n\nNEW REQUEST:\n{request}"
    )


def _parse_plan(text: str, request: str, has_code: bool) -> dict:
    try:
        raw = text[text.index("{"): text.rindex("}") + 1]
        plan = json.loads(raw)
        if not isinstance(plan, dict):
            raise ValueError
    except (ValueError, json.JSONDecodeError):
        return {"reply": "", "actions": [], "build": True, "build_brief": request}
    plan["actions"] = [a for a in plan.get("actions") or [] if isinstance(a, dict) and a.get("type")][:12]
    plan["build"] = bool(plan.get("build")) or not has_code
    plan["build_brief"] = str(plan.get("build_brief") or request)
    plan["reply"] = str(plan.get("reply") or "")
    return plan


def _matches(data: dict, where: dict) -> bool:
    return all(str(data.get(k)).strip().lower() == str(v).strip().lower() for k, v in (where or {}).items())


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


async def _execute(project_id: str, action: dict) -> str:
    """Run one command. Returns the sentence shown in chat; raises on failure."""
    kind = action["type"]
    doc = await db.projects.find_one({"id": project_id, **core.LIVE}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    table = str(action.get("table") or "")

    if kind == "create_table":
        core.check_table(table)
        cols = [str(c)[:64] for c in action.get("columns") or [] if str(c) not in core.RESERVED]
        await core.ensure_table(project_id, table, cols)
        return f"Created the {table} table" + (f" with {', '.join(cols)}" if cols else "")

    if kind == "add_rows":
        rows = [r for r in action.get("rows") or [] if isinstance(r, dict)][:MAX_ROWS_PER_ACTION]
        if not rows:
            raise ValueError("No rows to add")
        for r in rows:
            await core.insert_record(project_id, core.check_table(table), r)
        return f"Added {_plural(len(rows), 'row')} to {table}"

    if kind in ("update_rows", "delete_rows"):
        core.check_table(table)
        where = action.get("where") if isinstance(action.get("where"), dict) else {}
        rows = await db.records.find({"project_id": project_id, "table": table, **core.LIVE}, {"_id": 0}).to_list(core.MAX_RECORDS_PER_TABLE)
        hits = [r for r in rows if _matches(r.get("data", {}), where)]
        if kind == "update_rows":
            sets = action.get("set") if isinstance(action.get("set"), dict) else {}
            if not sets:
                raise ValueError("Nothing to change")
            for r in hits:
                await core.update_record(project_id, table, r["id"], sets)
            return f"Updated {_plural(len(hits), 'row')} in {table}"
        for r in hits:
            await core.delete_record(project_id, table, r["id"])
        return f"Moved {_plural(len(hits), 'row')} from {table} to the Bin"

    if kind == "delete_table":
        core.check_table(table)
        n = await core.delete_table(project_id, table)
        return f"Moved the {table} table and its {_plural(n, 'row')} to the Bin"

    if kind == "rename_project":
        title = str(action.get("title") or "").strip()[:120]
        if not title:
            raise ValueError("No title given")
        await db.projects.update_one({"id": project_id}, {"$set": {"title": title, "title_auto": False, "updated_at": core.now()}})
        return f"Renamed the project to {title}"

    if kind == "publish":
        slug = core.slugify(str(action.get("slug") or "")) if action.get("slug") else doc["slug"]
        await plans.check_live_quota(doc)
        slug = await core.publish_project(doc, slug)
        return f"Published the latest version at /app/{slug}"

    if kind == "unpublish":
        await db.projects.update_one({"id": project_id}, {"$set": {"published": False, "updated_at": core.now()}})
        return "Took the app offline. The link now shows a not-available page"

    if kind == "restore_version":
        number = int(action.get("number") or 0)
        new_number = await core.restore_version(doc, number)
        return f"Restored version {number}. It is saved as version {new_number}"

    if kind == "send_email":
        subject = str(action.get("subject") or "").strip()[:80]
        to, status = await email.send_builder_email(doc, subject, str(action.get("body") or ""))
        if status == "queued":
            return (f"Wrote the email for {to}: {subject}. Delivery is paused on the Emergent account, so it is in your "
                    "Kozzi Inbox now and will be sent automatically when sending resumes")
        return f"Emailed {to}: {subject}"

    raise ValueError(f"Unknown command {kind}")


def _err_text(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc)[:200] or "Something went wrong"


async def _phase(project_id: str, phase: str) -> None:
    await db.projects.update_one({"id": project_id}, {"$set": {"gen_phase": phase}})


async def run_agent(project_id: str, request: str) -> None:
    error = ""
    try:
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project:
            return
        await _phase(project_id, "planning")
        plan_text = await stream_text(llm_chat(PLANNER_PROMPT, 6000), await _context(project, request))
        plan = _parse_plan(plan_text, request, bool(project.get("html")))
        if plan["reply"]:
            await core.add_message(project_id, "assistant", plan["reply"], "plan")

        actions = plan["actions"]
        now_actions = [a for a in actions if a["type"] not in AFTER_BUILD]
        later_actions = [a for a in actions if a["type"] in AFTER_BUILD]
        if now_actions:
            await _phase(project_id, "working")
        for a in now_actions:
            await _run_action(project_id, a)

        if plan["build"]:
            await _phase(project_id, "building")
            brief = plan["build_brief"]
            if actions:
                brief += ("\n\nNote: Kozzi's own commands handle the data rows, publishing and emails in this request. "
                          "Only change the code, and do not mention those parts in SUMMARY.")
            number, summary = await build_code(project_id, brief)
            await core.add_message(project_id, "assistant", summary, "build", version_number=number)

        if later_actions:
            await _phase(project_id, "working")
        for a in later_actions:
            await _run_action(project_id, a)
    except Exception as exc:  # surface every failure to the user in the thread
        logger.exception("agent run failed for %s", project_id)
        budget = "budget" in str(exc).lower()
        error = "AI credits exhausted" if budget else str(exc)[:300]
        await core.add_message(
            project_id, "assistant",
            "The AI service is out of credits right now, so I stopped here. Press Retry once it is topped up."
            if budget else "I couldn't finish that. Press Retry, or rephrase the request.",
            "error", meta={"retry": True},
        )
    finally:
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"generating": False, "gen_phase": "", "gen_error": error, "updated_at": core.now()}},
        )


async def _run_action(project_id: str, action: dict) -> None:
    try:
        text = await _execute(project_id, action)
        await core.add_message(project_id, "assistant", text, "action", meta={"action": action["type"], "ok": True})
    except Exception as exc:  # one failed command should not stop the rest
        logger.warning("command %s failed: %s", action.get("type"), exc)
        await core.add_message(
            project_id, "assistant", f"Couldn't run {action['type'].replace('_', ' ')}: {_err_text(exc)}",
            "action", meta={"action": action["type"], "ok": False},
        )
