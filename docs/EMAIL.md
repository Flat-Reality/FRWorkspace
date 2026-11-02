# Workspace Email

Sender: **FLAT REALITY ENTERTAINMENT GROUP <hr@flatreality.eu>**.
Reply-To: **hr@flatreality.eu**. Footer: **Flat Reality Workspace**.

Uses the existing Supabase project and Purelymail subscription. No additional paid service is required within their existing quotas. SMTP uses `smtp.purelymail.com:465` with TLS. The browser never receives the SMTP password. Announcements are internal service updates to selected Workspace participants; this module is not for advertising or external mailing lists.

## Status and rollout

Live setup completed on 2 November 2026: the database migration and five-minute job are installed, and the SMTP-only Purelymail app credential is stored in Edge Function Secrets. Normal delivery, monthly XP and onboarding switches remain off pending the owner's review. The owner explicitly requested a nine-template test suite to their verified Workspace email; it uses separate private test dispatch without enabling normal automations or changing HR/XP data.

The frontend can be deployed before mail setup. It shows previews and a setup-pending state until the backend and migration are installed. No email is sent by installing the migration: all three switches start off. No historic HR records are emailed.

Target project: **FRWorkspace**, `kcsxspifrkuhbdmfahoy` (Cluster 1).

1. For a new installation only, run `supabase/migrations/20261102160301_workspace_email_automation.sql`, then `supabase/migrations/20261102163700_workspace_email_test_delivery.sql` in this project's **SQL Editor**, once each. They add three private RLS-protected tables, two triggers on `workspace_state`, private service-role functions, and a five-minute cron job. They do not change existing profiles, grants, or signatures. The job uses the existing private `workspace_sync_cron_token` in Vault. Leave the email switches off during setup.
2. In **Edge Functions → Secrets**, add:

   | Name | Value |
   | --- | --- |
   | `WORKSPACE_SMTP_USERNAME` | Full Purelymail login address authorised to send as `hr@flatreality.eu` |
   | `WORKSPACE_SMTP_PASSWORD` | Its mail app password (use an App Password if 2FA is enabled) |

   Do not put either value in GitHub Pages variables, frontend `.env` variables, source files, or chat. In Purelymail, confirm the domain is verified and its SPF/DKIM records are correct. If HR is an alias, its SMTP login must be allowed to use that From address.
3. The mail backend was deployed on 2 November 2026 (`workspace-api` v37, `workspace-email` v3). Redeployment is only needed if those versions are replaced. `workspace-api` must include `email-admin.ts` and `_shared/workspace-email.ts`. The new `workspace-email` function has gateway JWT verification disabled: it authenticates each call with the private cron token itself. The existing gateway setting for `workspace-api` is also unchanged (it validates opaque Workspace sessions internally). The CLI commands, if redeployment is needed, are:

   ```powershell
   npx supabase functions deploy workspace-api --project-ref kcsxspifrkuhbdmfahoy --no-verify-jwt
   npx supabase functions deploy workspace-email --project-ref kcsxspifrkuhbdmfahoy --no-verify-jwt
   ```

4. In **Admin → Workspace Email**, enable Workspace emails and save. Leave monthly summaries and onboarding reminders off initially. Select a template and **Send test to myself**. The test goes only to the current administrator's profile email, prefixed `[TEST]`; allow up to five minutes. Check the actual sender, banner, footer, button, spam folder, and delivery history. `sent` means the SMTP server accepted the email; it does not guarantee inbox placement.
5. Enable monthly summaries and/or onboarding reminders when ready. Use Announcements to compose an internal service update, select recipients, review, and confirm. This is an explicit send action.

## Automations

| Email | Trigger |
| --- | --- |
| Request for explanation | A new explanation-request work record is saved |
| Strike | A new strike work record is saved |
| Pause approved | HR changes status to paused or changes its approved end date |
| Mental health days approved | HR changes status to mental health days or changes its approved end date |
| Sabbatical approved | HR selects the template, end date, recipients, and confirms sending; there is no separate sabbatical status in the current data model |
| Sick pay approved | **Template only. No sick-leave event, payroll event, or automatic sending is connected.** An administrator can send themselves a test |
| Your month with Flat Reality | Previous calendar month's completed Workspace Timesheet hours and monthly XP award; Madrid time |
| Onboarding reminder | Once per ISO week for incomplete onboarding; stopped once completed or suspended |
| Announcement | Manual selection and confirmation in Admin; one separate message per participant |

Recipients prefer the member's Entra email, with personal email as fallback. The automatic trigger also recognises the legacy work-email field. HR details and explanation contents stay inside Workspace; notification messages prompt the recipient to open their account.

## LevelUp! policy

Verified against the live **LevelUp! Program** guide on 2 November 2026: **+50 XP for every full month with Flat Reality**. Monthly summaries credit 50 XP once per member/period, provided at least one full service month has elapsed by that period's end. The first monthly run is after activation, with no historic awards. Subsequent calendar-month awards represent continued full months of service. XP is not deducted for pauses or sick leave. Suspended accounts are excluded.

The +25 punctuality/reliability award, +100 work anniversary, +25 company anniversary, +5/hour recognised extra contribution, and approved-idea awards are not inferred from time tracking. HR retains these decisions. Ordinary tracked hours are not automatically classified as extra contribution. Existing onboarding XP logic is unchanged.

Only completed Workspace Timesheet entries count; entries crossing the month boundary are clipped to the period, using Europe/Madrid boundaries. Running timers and Upwork hours are excluded; do not interpret this figure as a combined payroll total.

The XP ledger prevents repeat awards. A server-side cumulative marker preserves credited XP when an older browser tab autosaves. Monthly writes and their emails are transactional.

An operator with the private cron token can POST `{"testOnly":true}` to `workspace-email` to dispatch explicitly labelled `[TEST...]` queue rows while the normal email switch remains off. This mode does not run the monthly/onboarding scheduler and cannot claim ordinary messages. The boolean claim overload is service-role-only. Test messages never create HR records or award XP; example figures must be labelled as examples.

## Queue and controls

HR event emails are enqueued in the same transaction as the corresponding state change. Unique keys deduplicate work-record events, weekly reminders, monthly summaries, and manual-send retries. Workers claim separate batches with row locking. Known pre-delivery SMTP failures back off, up to five attempts. Interrupted or ambiguous SMTP handoffs become `uncertain` for manual review; blindly retrying after acceptance could send a duplicate. Stable Message-ID values aid investigation but do not guarantee recipient-side deduplication.

Disable **Enable Workspace emails** to stop processing and event creation. Pending messages are retained; review and cancel them before re-enabling if they are no longer relevant. Individual pending, failed, or uncertain messages can be cancelled in the history. No automatic retry is offered for uncertain sends. Sent/cancelled history is retained for 90 days; the XP ledger is permanent to protect idempotency. Worker sends small batches every five minutes to stay within free execution limits; large queues take longer.

## Verification

```powershell
npm run build
npx deno test tests/email.test.ts
npm install --prefix work/email-tools --no-save @electric-sql/pglite@0.3.14
node tests/email-sql.mjs
```

The SQL tests run the actual migration and functions in an isolated PostgreSQL engine, without the hosted cron block or production access. Production SMTP delivery requires the credential setup and an explicitly triggered test. No account registration is needed for this subsystem.

Validation on 2 November 2026: frontend build and new email-module type checks passed; isolated SQL and template tests passed; Announcements recipient review and queue feedback were checked in the browser with a fully mocked backend. Full `workspace-api` Deno type checking reports 12 pre-existing errors, reproduced against the unchanged HEAD version (Entra warnings, collection types, provider identity and Retainer types); this change adds none. Hosted deployment succeeded. Purelymail accepted all nine authorised test messages to the owner's verified email without errors at 17:37–17:38 Madrid time. Actual inbox placement and rendering in the owner's mail client still require their review.
