import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@7.0.10';
import { renderWorkspaceEmail, validEmail } from '../_shared/workspace-email.ts';

const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function equal(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const token = await db.rpc('get_workspace_sync_cron_token');
    if (token.error || !equal(request.headers.get('x-workspace-sync-token') || '', String(token.data || ''))) return json({ error: 'Unauthorized.' }, 401);
    const testOnly = (await request.json().catch(() => ({}))).testOnly === true;
    const settings = await db.from('workspace_email_settings').select('enabled').eq('id', true).maybeSingle();
    if (settings.error) throw settings.error;
    if (!settings.data?.enabled && !testOnly) return json({ enabled: false });
    const user = Deno.env.get('WORKSPACE_SMTP_USERNAME'), pass = Deno.env.get('WORKSPACE_SMTP_PASSWORD');
    if (!user || !pass) return json({ error: 'SMTP is not configured; no XP or emails processed.' }, 503);
    if (!testOnly) {
      const scheduled = await db.rpc('workspace_email_schedule');
      if (scheduled.error) throw scheduled.error;
    }
    const claimed = testOnly ? await db.rpc('workspace_email_claim', { p_test_only: true }) : await db.rpc('workspace_email_claim');
    if (claimed.error) throw claimed.error;
    const transport = nodemailer.createTransport({ host: 'smtp.purelymail.com', port: 465, secure: true, auth: { user, pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000, tls: { minVersion: 'TLSv1.2' } });
    let sent = 0;
    try {
      for (const row of claimed.data || []) {
        try {
          if (!validEmail(row.recipient)) throw new Error('Invalid recipient address.');
          const { subject, html, text } = renderWorkspaceEmail(row.content);
          await transport.sendMail({ from: { name: 'FLAT REALITY ENTERTAINMENT GROUP', address: 'hr@flatreality.eu' }, to: row.recipient, replyTo: 'hr@flatreality.eu', subject, html, text, messageId: `<${row.id}@workspace.flatreality.eu>`, headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' } });
          const saved = await db.from('workspace_email_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id).eq('status', 'sending');
          if (saved.error) throw saved.error;
          sent++;
        } catch (error) {
          const e = error as { code?: string; command?: string; responseCode?: number };
          // Retry only errors known to precede DATA acceptance. A lost final SMTP
          // acknowledgement cannot safely be retried without risking a duplicate.
          const safe = ['ECONNECTION', 'EDNS', 'EAUTH', 'ECONNREFUSED'].includes(e.code || '') || (e.command && !['DATA', 'CONN'].includes(e.command) && e.responseCode && e.responseCode >= 400);
          const status = safe && row.attempts < 5 ? 'pending' : safe || !validEmail(row.recipient) ? 'failed' : 'uncertain';
          const saved = await db.from('workspace_email_queue').update({ status, available_at: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60000).toISOString(), last_error: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.' }).eq('id', row.id).eq('status', 'sending');
          if (saved.error) throw saved.error;
        }
      }
    } finally { transport.close(); }
    return json({ sent, processed: claimed.data?.length || 0 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Email processing failed.' }, 500); }
});
