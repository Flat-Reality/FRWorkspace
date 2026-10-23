import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { shiftEvent, type Shift, type Member } from './event.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
type Mapping = { shift_id: string; member_id: string; user_id: string; event_id: string | null; transaction_id: string; payload_hash: string };
class GraphError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function checked<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

async function graph(path: string, token: string, method: string, body?: unknown) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GraphError(response.status, data.error?.code || '', data.error?.message || `Microsoft Graph returned ${response.status}.`);
  return data;
}

async function accessToken() {
  const { data: secrets } = checked(await db.rpc('get_entra_runtime_secrets'));
  if (!secrets?.entra_client_id || !secrets?.entra_client_secret || !secrets?.entra_tenant_id) throw new Error('Microsoft Graph integration is not configured.');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(secrets.entra_tenant_id)}/oauth2/v2.0/token`, {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: secrets.entra_client_id, client_secret: secrets.entra_client_secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Microsoft Graph authorization failed.');
  const token = String(data.access_token);
  const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
  if (!claims.roles?.includes('Calendars.ReadWrite')) throw new Error('Outlook sync requires Microsoft Graph Calendars.ReadWrite (Application) with admin consent on the Workspace app.');
  return token;
}

async function sync() {
  const lockOwner = crypto.randomUUID();
  const { data: acquired } = checked(await db.rpc('acquire_workspace_outlook_lock', { lock_owner: lockOwner }));
  if (!acquired) return { ok: true, skipped: 'Synchronization is already running.' };
  const warnings: string[] = [];
  const counts = { created: 0, updated: 0, deleted: 0, unchanged: 0 };
  try {
    const token = await accessToken();
    // Read the latest state only after taking the lock; saves may overlap.
    const { data: row } = checked(await db.from('workspace_state').select('state').eq('id', 'workspace').single());
    if (!row?.state) throw new Error('Workspace state was not found.');
    const state = row.state as { members: Member[]; scheduleShifts: Shift[] };
    const members = new Map(state.members.map((member) => [member.id, member]));
    const desired = new Map<string, { shift: Shift; member: Member; user: string }>();
    for (const shift of state.scheduleShifts) {
      const member = members.get(shift.memberId);
      const user = member?.entraObjectId || member?.entraEmail;
      if (member && user && member.status !== 'suspended') desired.set(shift.id, { shift, member, user });
    }
    const mappings: Mapping[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = checked(await db.from('workspace_outlook_events').select('*').order('shift_id').range(offset, offset + 999));
      mappings.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const mapped = new Map(mappings.map((item) => [item.shift_id, item]));
    const deadline = Date.now() + 100_000;
    const blockedUsers = new Map<string, string>();
    let operations = 0;
    const budget = () => Date.now() < deadline && operations < 60;
    const remove = async (item: Mapping) => {
      if (item.event_id) {
        try { await graph(`/users/${encodeURIComponent(item.user_id)}/events/${encodeURIComponent(item.event_id)}`, token, 'DELETE'); }
        catch (error) { if (!(error instanceof GraphError && error.status === 404 && error.code === 'ErrorItemNotFound')) throw error; }
      }
      checked(await db.from('workspace_outlook_events').delete().eq('shift_id', item.shift_id));
      mapped.delete(item.shift_id);
      counts.deleted++;
    };
    // Only events recorded in our private mapping are ever deleted.
    for (const item of mappings) {
      const target = desired.get(item.shift_id);
      if (target && target.user === item.user_id && target.member.id === item.member_id) continue;
      if (!budget()) break;
      operations++;
      try { await remove(item); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Could not remove Outlook event.';
        warnings.push(`${item.member_id}: ${message}`);
        checked(await db.from('workspace_outlook_events').update({ last_error: message }).eq('shift_id', item.shift_id));
      }
    }
    for (const [id, target] of desired) {
      if (!budget()) break;
      let mapping = mapped.get(id);
      if (mapping && (mapping.user_id !== target.user || mapping.member_id !== target.member.id)) continue;
      try {
        const event = shiftEvent(target.shift, target.member);
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(event)));
        const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
        if (mapping?.event_id && mapping.payload_hash === hash) { counts.unchanged++; continue; }
        if (!mapping) {
          mapping = { shift_id: id, member_id: target.member.id, user_id: target.user, event_id: null, transaction_id: crypto.randomUUID(), payload_hash: '' };
          checked(await db.from('workspace_outlook_events').insert(mapping));
        }
        if (blockedUsers.has(target.user)) throw new Error(blockedUsers.get(target.user));
        operations++;
        const path = `/users/${encodeURIComponent(target.user)}/events`;
        if (mapping.event_id) {
          try { await graph(`${path}/${encodeURIComponent(mapping.event_id)}`, token, 'PATCH', event); }
          catch (error) {
            if (!(error instanceof GraphError && error.status === 404 && error.code === 'ErrorItemNotFound')) throw error;
            mapping.event_id = null;
            mapping.transaction_id = crypto.randomUUID();
            checked(await db.from('workspace_outlook_events').update({ event_id: null, transaction_id: mapping.transaction_id }).eq('shift_id', id));
          }
        }
        if (!mapping.event_id) {
          // Persist the transaction ID before POST so a retry cannot create a duplicate.
          const created = await graph(path, token, 'POST', { ...event, transactionId: mapping.transaction_id });
          if (!created?.id) throw new Error('Microsoft Graph did not return an event ID.');
          mapping.event_id = created.id;
          counts.created++;
        } else counts.updated++;
        checked(await db.from('workspace_outlook_events').update({ event_id: mapping.event_id, transaction_id: mapping.transaction_id, payload_hash: hash, synced_at: new Date().toISOString(), last_error: null }).eq('shift_id', id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Outlook synchronization failed.';
        warnings.push(`${target.member.id}: ${message}`);
        if (error instanceof GraphError && (error.status === 403 || ['MailboxNotEnabledForRESTAPI', 'ErrorInvalidUser', 'ResourceNotFound'].includes(error.code))) blockedUsers.set(target.user, message);
        if (mapping) checked(await db.from('workspace_outlook_events').update({ last_error: message }).eq('shift_id', id));
      }
    }
    const result = { ok: warnings.length === 0, ...counts, warnings: [...new Set(warnings)], deferred: !budget() };
    checked(await db.from('workspace_audit_log').insert({ event_type: result.ok ? 'calendar.outlook_synced' : 'calendar.outlook_sync_partial', event_payload: { summary: 'Outlook calendar synchronization completed.', ...result } }));
    return result;
  } finally {
    checked(await db.rpc('release_workspace_outlook_lock', { lock_owner: lockOwner }));
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!serviceKey || request.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ error: 'Unauthorized.' }, 401);
  try { return json(await sync()); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Outlook synchronization failed.';
    await db.from('workspace_audit_log').insert({ event_type: 'calendar.outlook_sync_failed', event_payload: { summary: message } });
    return json({ error: message }, 500);
  }
});
