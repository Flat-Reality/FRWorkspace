# Timesheet

Timesheet is available to active Workspace members without an experiment flag. The sidebar retains the existing calendar icon and internal `schedule` view key. The **Schedue** tab contains the existing calendar and appears only when HR enables `scheduleEnabled` in Experiments.

The timer persists its start and stop instants on the server. Seconds are retained; totals display `HH:MM` without rounding. Stop freezes the period and opens confirmation. Closing the dialog keeps a pending entry, which can be confirmed after navigation or reload. A GitHub issue URL is required unless **I don't have this link** is checked. The optional project picker contains only assigned projects. Manual entries reject future periods, overlaps and periods longer than 24 hours.

The browser title shows an active timer while navigating between Workspace pages. Timesheets refresh on window focus and every 30 seconds. The API uses the authenticated Workspace member, never a member ID supplied by the browser. Compare-and-swap revisions protect concurrent saves. Local development without Supabase uses separate per-member local storage and browser locks.

The diary uses the member's IANA time zone (browser zone if unset, UTC if invalid). Weeks run Monday–Sunday. Entries crossing midnight contribute only the intersecting duration to each day. Tracked/manual markers and week/day navigation are available. Overtime is shown when a known Upwork weekly limit is exceeded; no limit is invented for local tracking.

Upwork-contract members cannot mutate local time, including through the API. Their card links to Upwork. Existing synced history supplies daily totals. That integration currently fetches up to 100 records from the last 90 days and does not provide precise intervals or a manual/tracked classification. Consequently its summary uses **Today** and **Synced time** instead of claiming an exact rolling 24-hour or lifetime total. No earnings are displayed in either Timesheet tab.

## Deploy order

1. Apply `supabase/migrations/20261030133450_workspace_timesheets.sql` to the target database.
2. Deploy `workspace-api`, including its new `timesheet-store.ts` and shared `timesheet.ts` modules.
3. Deploy the frontend. The feature branch does not trigger the existing main-only Pages workflow.

The new table has RLS enabled and no public/client policies. `anon` and `authenticated` have no table privileges. The existing session-validating Edge Function accesses only the actor's row using `service_role`.

## Verification

- `npm run build` — frontend types and production build.
- `node --test tests/timesheet.test.mjs` — Node 22.18+; duration precision, DST, overlap validation, Upwork restriction, idempotency, isolation and concurrent repository writes.
- `node tests/timesheet-browser.cjs` — local Vite at port 5174; Playwright with installed Edge. Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the repository. Tests replace integrations with synthetic fixtures and cover navigation, reload, pending recovery, validation, failed-save retry, real browser audio play events, mobile layout, experiment gating and Upwork. Screenshots go to `outputs/timesheet/`.
- `node tests/timesheet-sql.cjs` — local PostgreSQL via `@electric-sql/pglite`; set `PGLITE_MODULE` to its package directory if needed. Verifies migration, RLS, service access and rejected direct client access.
- `deno check supabase/functions/_shared/timesheet.ts supabase/functions/workspace-api/timesheet-store.ts` — new API modules. The complete `workspace-api/index.ts` has 12 pre-existing Deno type errors, reproduced against the unchanged HEAD version; none originate in Timesheet.

The supplied recording was cut into `tracking-start.wav` (first cue, 0–1.02 s) and `tracking-confirm.wav` (third cue, 2.75–4.04 s). Reproduce with `node scripts/cut-tracking-audio.cjs <original.wav>`. Playback follows successful persistence; stop alone plays no completion cue. Browser playback events were tested; physical speaker output and a deployed Supabase instance were not tested.
