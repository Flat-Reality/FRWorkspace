# Flat Reality Workspace Security Migration

This migration moves password verification and database writes behind a Supabase Edge Function.

## What Changes

- The browser no longer checks passwords directly in React.
- The browser no longer reads or writes `workspace_state` directly.
- Password hashes are moved from the shared JSON state into `workspace_credentials`.
- Session tokens are stored in `workspace_sessions` and expire after 90 days.
- Normal users receive only their own profile, work records, and schedule data.
- Admin users receive the full workspace state.

## Safe Deployment Order

1. Commit and push the updated site code.
2. Deploy the Supabase Edge Function:

```powershell
supabase functions deploy workspace-api --project-ref kcsxspifrkuhbdmfahoy
```

3. In Supabase SQL Editor, run:

```text
supabase-security-hardening.sql
```

4. Deploy GitHub Pages:

```powershell
npm run deploy
```

5. Open the live Workspace and sign in.

## Important

Do not run `supabase-security-hardening.sql` before the Edge Function is deployed. The script closes direct browser access to `workspace_state`, so the static site needs `workspace-api` to be online first.

The script creates `workspace_state_backup` before changing access. If anything goes wrong, the previous JSON state is still available there.
