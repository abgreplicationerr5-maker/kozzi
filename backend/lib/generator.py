"""Claude-powered app generation. Runs as a background task so long generations
survive page navigation and proxy timeouts; the frontend polls the project."""

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from lib.db import db

logger = logging.getLogger(__name__)

MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-5-5"

# project_id -> characters streamed so far (progress hint for the UI)
PROGRESS: dict[str, int] = {}

SYSTEM_PROMPT = """You are Kozzi, an expert product engineer who builds complete, production-quality web apps as ONE self-contained HTML file (HTML + CSS + JavaScript).

RUNTIME
The app runs inside a sandboxed iframe. A global `kozzi` object is injected before your scripts run. It is the app's REAL persistent database: use it for ALL data:
  await kozzi.db.list(table)                -> array of rows: { id, created_at, updated_at, ...fields } (newest first)
  await kozzi.db.get(table, id)             -> row or null
  await kozzi.db.insert(table, fields)      -> created row
  await kozzi.db.update(table, id, fields)  -> updated row (fields are merged)
  await kozzi.db.remove(table, id)          -> true
  await kozzi.ai.ask(prompt, system?)       -> string (an AI text completion; use only when the user asks for AI features)
  await kozzi.email.notifyOwner(subject, message) -> sends a real email to the app's owner (plain text message). Use for "notify me when someone signs up / orders / submits".
  await kozzi.email.sendReceipt(table, id)  -> sends a fixed confirmation email to the address in that row's `email` field (once per row). Use for "email the guest a confirmation". Store the address in a field named `email`.
  Emails are capped per app per day and may throw; never block the main action on them, show a small inline note if they fail.
  kozzi.ready                               -> Promise that resolves when the runtime is connected
Tables are created automatically on first insert. Table names: lowercase snake_case (e.g. clients, habits, check_ins). Field values must be JSON (strings, numbers, booleans, arrays, objects). All calls are async and may throw: catch errors and show a friendly inline message.

HARD RULES
- Output the COMPLETE file every time, never a diff or partial snippet. Never use "..." placeholders.
- NEVER use localStorage, sessionStorage, cookies, IndexedDB or window.parent: they are blocked in the sandbox. Persist everything through kozzi.db.
- NEVER hardcode fake/sample/demo records. The app starts empty and shows a helpful empty state inviting the user to add the first item. Every list, stat and chart is computed from real kozzi.db rows.
- Every button, link, form and filter must actually work. No dead links (use buttons or in-page navigation; for multi-view apps implement simple client-side view switching). No alert()-only stubs.
- Validate forms, show loading states while data loads, and update the UI immediately after writes.
- Fully responsive (looks great at 375px phone, 768px tablet and desktop).
- Wait for `await kozzi.ready` before the first data load.
- Write plain, human UI copy. Never use em dashes or en dashes. No spaced-out uppercase letter labels, no filler like "Welcome to your workspace", no lorem ipsum, no fake testimonials or fake stats.

DESIGN
- Write polished, modern CSS: clear typography hierarchy, generous spacing, subtle borders and shadows, smooth hover/focus transitions, accessible contrast. Pick a tasteful palette that fits the app unless the user specifies one.
- You MAY load from CDNs: Google Fonts, Tailwind Play CDN (<script src="https://cdn.tailwindcss.com"></script>), Chart.js (https://cdn.jsdelivr.net/npm/chart.js), lucide icons (https://unpkg.com/lucide@latest), date-fns, etc. Hand-written CSS in a <style> tag is preferred for full control.
- Use vanilla JavaScript (ES modules or plain scripts). No build step, no React/JSX.

RESPONSE FORMAT (exactly):
TITLE: <short app name, 2-4 words>
SUMMARY: <1-2 plain sentences saying what you built or changed, written to the user, no em dashes>
```html
<!DOCTYPE html>
... the complete file ...
```"""

TITLE_RE = re.compile(r"^\s*TITLE:\s*(.+)$", re.MULTILINE)
SUMMARY_RE = re.compile(r"SUMMARY:\s*(.+?)(?:```|$)", re.DOTALL)
HTML_RE = re.compile(r"```(?:html)?\s*\n(.*?)(?:```|$)", re.DOTALL)


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_output(text: str) -> tuple[str, str, str]:
    title_m = TITLE_RE.search(text)
    summary_m = SUMMARY_RE.search(text)
    html_m = HTML_RE.search(text)
    title = title_m.group(1).strip()[:80] if title_m else ""
    summary = summary_m.group(1).strip() if summary_m else ""
    html = html_m.group(1).strip() if html_m else ""
    if not html and "<html" in text.lower():
        html = text[text.lower().index("<!doctype") if "<!doctype" in text.lower() else text.lower().index("<html"):].strip()
    return title, summary, html


def llm_chat(system: str, max_tokens: int = 32000) -> LlmChat:
    return (
        LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=str(uuid.uuid4()),
            system_message=system,
        )
        .with_model(MODEL_PROVIDER, MODEL_NAME)
        .with_params(max_tokens=max_tokens)
    )


# The LLM key allows a limited number of parallel requests: queue them in-process and
# retry briefly when the provider still reports a concurrency limit.
_LLM_SLOTS = asyncio.Semaphore(int(os.environ.get("LLM_CONCURRENCY", "1")))


async def stream_text(chat: LlmChat, text: str, progress_key: str | None = None) -> str:
    async with _LLM_SLOTS:
        for attempt in range(4):
            parts: list[str] = []
            count = 0
            try:
                async for ev in chat.stream_message(UserMessage(text=text)):
                    if isinstance(ev, TextDelta):
                        parts.append(ev.content)
                        count += len(ev.content)
                        if progress_key:
                            PROGRESS[progress_key] = count
                    elif isinstance(ev, StreamDone):
                        break
                return "".join(parts)
            except Exception as exc:
                if "concurrent" not in str(exc).lower() and "429" not in str(exc) or attempt == 3:
                    raise
                await asyncio.sleep(4 * (attempt + 1))
    return ""


async def build_prompt(project: dict, request: str) -> str:
    history = await db.messages.find(
        {"project_id": project["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(12)
    history.reverse()
    convo = "\n".join(
        f"{m['role'].upper()}: {m['content'][:1500]}" for m in history[:-1]
    ) or "(none)"
    tables = await db.app_tables.find({"project_id": project["id"]}, {"_id": 0}).to_list(50)
    schema = "\n".join(f"- {t['name']}: {', '.join(t.get('columns', []))}" for t in tables) or "(no tables yet)"
    current = project.get("html") or ""
    code_part = (
        f"CURRENT APP CODE (modify it to satisfy the request, keep everything else working):\n```html\n{current}\n```"
        if current else "There is no code yet, build the app from scratch."
    )
    return (
        f"{code_part}\n\nEXISTING DATABASE TABLES (keep using these names/fields so live data stays intact):\n{schema}\n\n"
        f"CONVERSATION SO FAR:\n{convo}\n\nNEW REQUEST:\n{request}"
    )


async def build_code(project_id: str, request: str) -> tuple[int, str]:
    """Write the next version of the app's code. Returns (version number, summary).
    Raises on failure; the agent turns that into a chat message."""
    PROGRESS[project_id] = 0
    try:
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project:
            raise ValueError("Project not found")
        prompt = await build_prompt(project, request)
        text = await stream_text(llm_chat(SYSTEM_PROMPT), prompt, project_id)
        title, summary, html = parse_output(text)
        if not html or "<" not in html:
            raise ValueError("The model did not return app code")
        number = int(project.get("version_count", 0)) + 1
        ts = now()
        await db.versions.insert_one({
            "id": str(uuid.uuid4()), "project_id": project_id, "number": number,
            "label": request[:120], "html": html, "created_at": ts,
        })
        update: dict = {"html": html, "version_count": number, "version_pointer": number, "updated_at": ts}
        if title and project.get("title_auto", True):
            update["title"] = title
        if not project.get("description"):
            update["description"] = (summary or request)[:300]
        await db.projects.update_one({"id": project_id}, {"$set": update})
        return number, summary or "Your app has been updated."
    finally:
        PROGRESS.pop(project_id, None)


async def ai_complete(prompt: str, system: str = "") -> str:
    chat = llm_chat(system or "You are a concise, helpful assistant embedded in a web app.", 2000)
    return (await stream_text(chat, prompt)).strip()
