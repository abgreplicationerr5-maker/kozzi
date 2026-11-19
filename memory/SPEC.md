# Kozzi — living spec

AI web-app builder + host (Lovable/Base44-style). Users describe an app; Claude Sonnet 5.5
(`claude-sonnet-5-5` via Emergent LLM key) writes ONE self-contained HTML/CSS/JS file that runs in a
sandboxed iframe and persists data through an injected `kozzi` SDK (postMessage bridge → Kozzi API).

## Auth
Emergent-managed Clerk (email+password & Google). `/sign-in`, `/sign-up` (Clerk components; includes
password reset + email verification). Backend `require_user` verifies Bearer token (frontend sets it via
`setTokenGetter` in `lib/api.ts`). No roles. Test users: see memory/test_credentials.md.

## Routes (frontend)
- `/` landing: hero prompt (signed-out → saved in localStorage `kozzi_pending_intent`, → /sign-up → /dashboard finishes it), sample gallery (live mini previews; Open → /app/:slug; Duplicate), pricing (CTAs → /sign-up?plan=… ; payments NOT wired yet), footer.
- `/dashboard` (auth): collapsible sidebar (persisted in user prefs), Projects / Sample apps / Settings dialog, prompt bar + 4 starter chips, searchable project grid (Draft/Live badge, updated time, Edit/Visit/Duplicate/Delete).
- `/builder/:projectId` (auth): chat left, tabs Preview (desktop/tablet/phone) / Data (spreadsheet CRUD on live tables) / Code (highlight.js, copy, download). Top bar: inline title autosave, undo/redo, version history (restore), Publish popover (slug, copy link, unpublish).
- `/app/:slug` public hosted app (no Clerk), full screen + "Built with Kozzi" badge.

## Data model (Mongo, string uuid ids)
- users {user_id, display_name, workspace_name, preferences{default_device, sidebar_collapsed}}
- projects {id, owner_id, title, title_auto, slug(unique), description, html, published, published_html, published_at, is_sample, version_count, version_pointer, generating, gen_error, gen_started_at}
- versions {id, project_id, number, label, html}
- messages {id, project_id, role user|assistant, content, version_number, error}
- app_tables {project_id, name, columns[]}; records {id, project_id, table, data{}, created_at, updated_at}

## Generation
POST /api/projects/{id}/messages → 202, background asyncio task; frontend polls GET /api/projects/{id} every 1.5s while `generating`. LLM key allows ONE concurrent request → in-process semaphore + 429 retry; generations queue. Each finish = new version + assistant message.
Undo/redo move `version_pointer`; restore creates a new version.

## Samples
`backend/seed.py` builds 4 published sample apps (owner `kozzi-samples`, slugs client-tracker, habit-log, event-rsvp, inventory-manager) with the real generator. Anyone can read/write their live data publicly. Duplicate copies code+table schema (not rows); duplicating your own project copies rows too.

## Key API
/api/me GET/PATCH · /api/projects CRUD · /duplicate · /messages · /versions · /undo · /redo · /versions/{n}/restore · /publish {slug} · /unpublish · /projects/{id}/tables[/{t}/records[/{rid}]] · /columns · /ai · /api/public/samples · /api/public/apps/{slug}[/tables/{t}/records…] · /ai
