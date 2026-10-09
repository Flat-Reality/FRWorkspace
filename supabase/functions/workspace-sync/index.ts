import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function timingSafeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const requestBody = await request.json().catch(() => ({}));
    const { data: expectedToken, error: secretError } = await supabase.rpc('get_workspace_sync_cron_token');
    if (secretError || typeof expectedToken !== 'string') throw secretError || new Error('Workspace sync token is not configured.');
    const suppliedToken = request.headers.get('x-workspace-sync-token') ?? '';
    if (!timingSafeEqual(suppliedToken, expectedToken)) return json({ error: 'Unauthorized.' }, 401);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/workspace-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: requestBody?.retainerOnly ? 'scheduled_retainer_sync' : 'scheduled_sync' }),
    });
    const payload = await response.json().catch(() => ({}));
    return json(payload, response.status);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Scheduled Workspace synchronization failed.' }, 500);
  }
});
