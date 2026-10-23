# Outlook Schedule Synchronization

Workspace is the source of truth. Shifts are copied into each employee's default
Outlook calendar using their Entra object ID (or Entra email when no ID exists).
Creating, editing and deleting a shift creates, updates and deletes its linked
appointment. No meeting invitations are sent. Other calendar events are untouched.

## Activation

In Microsoft Entra admin center, open **App registrations > Flat Reality Workspace
> API permissions > Add a permission > Microsoft Graph > Application permissions**.
Add **Calendars.ReadWrite**, then **Grant admin consent for Flat Reality**.
Delegated permissions and User.ReadWrite.All do not authorize this background job.

The employee must have an Exchange Online/Outlook mailbox. Creating an Entra user
does not create a mailbox. If necessary, provision an appropriate mailbox license.
After consent/provisioning, the existing five-minute job retries automatically.

## Operation

- Schedule saves trigger background synchronization; the existing five-minute job
  also retries failures and imports existing shifts.
- Times follow the employee's Workspace time zone. A missing zone uses UTC;
  invalid dates, time zones and time ranges are logged and skipped.
- Private `workspace_outlook_events` rows retain event IDs and transaction IDs.
  A database lease serializes overlapping runs. Failed POSTs reuse their saved
  transaction ID to avoid duplicate appointments.
- Unchanged shifts do not issue Graph writes. A run processes at most 60 changed
  items within a bounded time budget; remaining items wait for the next run.
- Changes made directly in Outlook are not imported into Workspace. Edit shifts
  in Workspace. Missing events are recreated when their shift next changes.
- Suspended/unlinked/deleted members have their mapped appointments removed when
  the next synchronization runs, subject to mailbox access remaining available.
- Calendar failures appear in Admin audit logs under `calendar.outlook_*`.
  Schedule saves still succeed when Outlook is unavailable.

## Verification

Run `deno test supabase/functions/outlook-calendar-sync/event_test.ts` and
`deno check supabase/functions/outlook-calendar-sync/index.ts`.
An end-to-end Graph verification additionally requires the permission and mailbox
above: create a shift, edit it, delete it and confirm a single matching event is
created, updated and removed. Re-running a sync must not add another event.

Deployment verification: 11 event tests and type checks for the new worker and
workspace-sync passed. Database checks confirmed lease exclusion and no client
access to mapping/lock tables. The live Graph run reported missing application
Calendars.ReadWrite consent, so real event creation remains unverified until
activation. A full workspace-api type check also reports pre-existing type errors
in identity/access code outside this integration.
