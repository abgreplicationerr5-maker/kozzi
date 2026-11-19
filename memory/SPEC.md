# Kozzi: living spec

AI web-app builder and host (Lovable/Base44-style). Users describe an app; Kozzi's chat agent plans
the work, runs commands (data, project, email) and, when code must change, Claude Sonnet 5.5
(`claude-sonnet-5-5` via Emergent LLM key) writes ONE self-contained HTML/CSS/JS file that runs in a
sandboxed iframe and persists data through an injected `kozzi` SDK (postMessage bridge to the Kozzi API).

## Auth
Emergent-managed Clerk (email+password and Google). `/sign-in`, `/sign-up` (Clerk components; includes
password reset + email verification). Backend `require_user` verifies the Bearer token. No roles.
Test users: memory/test_credentials.md. The owner's email is looked up from Clerk (`lib/email.owner_email`)
and cached on `users.email`.

## Routes (frontend)
- `/` landing: hero prompt (signed-out: saved in localStorage `kozzi_pending_intent`, then /sign-up, then /dashboard finishes it), how-it-works (4 tiles), **Gallery** of published apps whose owners switched on "Show in the Kozzi gallery" (open, or "Make a copy" which duplicates code + table structure, never rows), pricing (CTAs go to sign-up; payments NOT wired yet), footer.
- `/dashboard` (auth): collapsible sidebar (Projects, Bin, Settings, Quick jump), prompt bar + 5 starters, searchable project grid (plain "Live"/"Draft" text, updated time, version, views; Edit/Visit/Duplicate/Delete). `?section=bin` shows the Bin, `?settings=1` opens Settings.
- `/builder/:projectId` (auth): chat left; tabs Preview (desktop/tablet/phone) / Data (spreadsheet CRUD, CSV export) / Code / Activity (views, rows, emails, 14-day chart, recent emails). Top bar: inline title autosave, undo/redo, version history, Publish popover (slug, gallery switch, copy link, unpublish), command menu button.
- `/app/:slug` public hosted app (no Clerk), full screen + "Built with Kozzi" badge. Counts a view (`?view=1`).
- Global command menu: Ctrl/Cmd+K (signed in): new blank project, dashboard, Bin, settings, sign out, open any project, open any live app.

## Chat agent (backend/lib/agent.py)
POST /api/projects/{id}/messages -> 202, background task `run_agent`:
1. planner LLM call returns JSON {reply, actions[], build, build_brief} -> `plan` message
2. each command -> `action` message with meta {action, ok}. Commands: create_table, add_rows, update_rows, delete_rows (soft), delete_table (soft), rename_project, unpublish, restore_version run BEFORE the build; publish and send_email run AFTER the build.
3. if build: `build_code` (lib/generator.py) -> new version + `build` message
Failures -> `error` message with meta.retry; POST /projects/{id}/retry re-runs the last user request. `gen_phase` = planning|working|building drives the indicator. Frontend polls project + messages every 1.5s while generating. `gen_error == "AI credits exhausted"` shows a credits banner with Retry.
All assistant text passes `core.tidy` (no em/en dashes).

## Email (backend/lib/email.py, Emergent managed email; EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME=Kozzi)
Recipients are always server-side: (a) chat `send_email` -> the signed-in owner; (b) `kozzi.email.notifyOwner(subject, message)` -> the app owner; (c) `kozzi.email.sendReceipt(table, id)` -> the `email` field of that stored row, fixed template, once per row. Cap 30 sends per app per day. Every send is logged in `emails` and runs `_assert_safe_email`. Billing refusals (402/403/409) return 503 with an owner-facing explanation on owner routes and a generic message on public routes.
**Outbox + Inbox (workaround while delivery is paused):** every email is stored in `emails` with html + plain `text`, `status` sent|queued|failed|sent_manually, `owner_id`, `attempts`, `last_error`, `read`.
A billing refusal (EmailPaused) keeps it `queued` instead of erroring, so chat commands and app calls still succeed (EmailOut.status = "queued").
Platform cron `.emergent/crons.yml` `email-outbox` (every 15 min) POSTs /api/cron/email-outbox (Bearer WEBHOOK_CRON_SECRET, idempotent by X-Webhook-Id in `cron_runs`) -> background `flush_outbox()` resends oldest-first and stops at the first billing refusal.
Dashboard `?section=inbox` (sidebar unread count, Ctrl K "Open the Inbox"): list + detail, "Send from my email app" (mailto with to/subject/body), "I sent it" (status sent_manually, leaves the queue), "Copy text", "Try sending now" (POST /api/inbox/flush). API: GET /api/inbox, POST /inbox/{id}/read, /inbox/read-all, /inbox/{id}/mark-sent, /inbox/flush.
Undeliverable recipients (e.g. example.com) return 422; other provider errors return 503 (never 502: the edge proxy replaces 502 bodies).
**Status at time of writing: the provider returns 402 insufficient_credits for this account, so emails queue in the Inbox until the Universal Key budget allows email.**

## Own domain + embed (backend/routers/domains.py, frontend ShareDialog)
Emergent hosting allows ONE custom domain per deployment, added by hand in the Emergent dashboard, so per-app domains work by registrar forwarding:
user saves a domain (PUT /projects/{id}/domain, normalized, unique across live projects), forwards it at their registrar (301, or masked/framed) to `<kozzi host>/app/<slug>`,
then POST /projects/{id}/domain/check fetches https then http://domain/ (no auto-redirects, max 6 hops, only public IPs to block SSRF) and marks `connected` when a redirect lands on `/app/<slug>` on the Kozzi host (taken from X-Forwarded-Host) or a 200 page frames it; otherwise `failed` with a plain reason. DELETE removes it.
Embed tab: copy-ready `<iframe>` snippet (600/720/900px). Entry points: Publish popover "Own domain" / "Embed" buttons (published apps). Dashboard cards show the domain.

## Soft delete + Bin
Nothing is hard-deleted. Projects, app_tables and records get `deleted_at` (tables + their rows share a `deleted_batch`). All reads filter `deleted_at: None` (`core.LIVE`). Bin (`/api/trash`) lists the last 30 days; restore endpoints: `/trash/projects/{id}/restore`, `/trash/projects/{id}/tables/{name}/restore`, `/trash/records/{id}/restore`. Deleting a project takes its live link offline (public_project filters deleted).

## Data model (Mongo, string uuid ids)
- users {user_id, display_name, workspace_name (optional team name), email, preferences{default_device, sidebar_collapsed}}
- projects {id, owner_id, custom_domain, domain_status pending|connected|failed, domain_detail, domain_checked_at, title, title_auto, slug(unique), description, html, published, published_html, published_at, in_gallery, version_count, version_pointer, generating, gen_phase, gen_error, gen_started_at, deleted_at}
- versions {id, project_id, number, label, html}
- messages {id, project_id, role user|assistant, kind user|plan|action|build|error|note, content, version_number, error, meta{}}
- app_tables {project_id, name, columns[], deleted_at, deleted_batch}; records {id, project_id, table, data{}, created_at, updated_at, deleted_at, deleted_batch}
- app_visits {project_id, day, count}; emails {id, project_id, kind builder|notify|receipt, to, subject, ok, record_id, day, created_at}
Old sample apps (owner `kozzi-samples`) were retired via soft delete; seed.py removed.

## Key API
/api/me GET/PATCH · /api/projects CRUD · /duplicate · /messages · /retry · /versions · /undo · /redo · /versions/{n}/restore · /publish {slug, in_gallery?} · /unpublish · /gallery {in_gallery} · /stats · /domain PUT/DELETE · /domain/check · /email/notify · /email/receipt · /projects/{id}/tables[/{t}/records[/{rid}]] · /columns · /ai · /api/trash[...] · /api/public/gallery · /api/public/apps/{slug}[?view=1][/tables/{t}/records…][/ai][/email/notify|receipt]
