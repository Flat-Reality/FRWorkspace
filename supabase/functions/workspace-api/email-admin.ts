import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { mailKinds, renderWorkspaceEmail, validEmail } from '../_shared/workspace-email.ts';
import type { EmailContent } from '../_shared/workspace-email.ts';

type Member = { id: string; isAdmin?: boolean; preferredName?: string; fullName?: string; entraEmail?: string; personalEmail?: string; status?: string };
export async function emailAdmin(db: SupabaseClient, actor: Member, members: Member[], body: Record<string, unknown>) {
  if (!actor.isAdmin) throw new Error('Administrator access is required.');
  const command = String(body.command || 'status');
  if (command === 'preview') {
    const content = body.content as EmailContent;
    if (!content || !mailKinds.includes(content.kind)) throw new Error('Choose a valid email template.');
    return renderWorkspaceEmail(content);
  }
  const settings = await db.from('workspace_email_settings').select('*').eq('id', true).maybeSingle();
  if (settings.error || !settings.data) {
    if (command === 'status') return { installed: false, configured: false, settings: null, messages: [] };
    throw new Error('Email setup is not installed yet. Follow docs/EMAIL.md.');
  }
  if (command === 'status') {
    const messages = await db.from('workspace_email_queue').select('id,member_id,recipient,content,status,attempts,created_at,sent_at,last_error').order('created_at', { ascending: false }).limit(100);
    if (messages.error) throw messages.error;
    return { installed: true, configured: Boolean(Deno.env.get('WORKSPACE_SMTP_USERNAME') && Deno.env.get('WORKSPACE_SMTP_PASSWORD')), settings: settings.data, messages: messages.data };
  }
  if (command === 'settings') {
    const update = body.settings as Record<string, unknown>;
    if (!update || typeof update.enabled !== 'boolean' || typeof update.monthly_enabled !== 'boolean' || typeof update.onboarding_enabled !== 'boolean') throw new Error('Valid email settings are required.');
    const result = await db.from('workspace_email_settings').update({ enabled: update.enabled, monthly_enabled: update.monthly_enabled, onboarding_enabled: update.onboarding_enabled, activated_at: settings.data.activated_at || (update.enabled ? new Date().toISOString() : null), updated_at: new Date().toISOString() }).eq('id', true);
    if (result.error) throw result.error;
    return { ok: true };
  }
  if (command === 'cancel') {
    const result = await db.from('workspace_email_queue').update({ status: 'cancelled' }).eq('id', String(body.id)).in('status', ['pending', 'failed', 'uncertain']);
    if (result.error) throw result.error;
    return { ok: true };
  }
  if (command === 'test' || command === 'announce' || command === 'sabbatical') {
    if (!settings.data.enabled) throw new Error('Enable Workspace emails before sending.');
    if (!Deno.env.get('WORKSPACE_SMTP_PASSWORD') || !Deno.env.get('WORKSPACE_SMTP_USERNAME')) throw new Error('SMTP credentials have not been configured.');
    const requestId = String(body.requestId || '');
    if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('A valid request ID is required.');
    let targets: Member[];
    let content: EmailContent;
    if (command === 'test') {
      content = body.content as EmailContent;
      if (!content || !mailKinds.includes(content.kind)) throw new Error('Choose a valid template.');
      // Tests go only to the current administrator, never an arbitrary supplied address.
      targets = [actor];
    } else {
      const title = String(body.title || '').trim(), message = String(body.message || '').trim();
      if (command === 'announce' && (!title || title.length > 180 || !message || message.length > 10000)) throw new Error('Enter a title (up to 180 characters) and message (up to 10,000 characters).');
      const ids = Array.isArray(body.memberIds) ? body.memberIds : [];
      targets = members.filter(m => ids.includes(m.id) && m.status !== 'suspended');
      if (!targets.length || targets.length > 500) throw new Error('Select between 1 and 500 active recipients.');
      if (command === 'sabbatical' && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.until || ''))) throw new Error('Choose the approved end date.');
      content = command === 'sabbatical' ? { kind: 'sabbatical_approved', until: String(body.until) } : { kind: 'announcement', title, message };
    }
    const rows = targets.map(member => {
      const recipient = member.entraEmail || member.personalEmail;
      if (!validEmail(recipient)) throw new Error(`A valid email address is missing for ${member.preferredName || member.fullName || member.id}.`);
      return { dedupe_key: `${command}:${requestId}:${member.id}`, member_id: member.id, recipient, content: { ...content, name: member.preferredName || member.fullName || '', ...(command === 'test' ? { title: `[TEST] ${renderWorkspaceEmail(content).subject}` } : {}) } };
    });
    const result = await db.from('workspace_email_queue').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (result.error) throw result.error;
    return { ok: true, queued: rows.length };
  }
  throw new Error('Unknown email command.');
}
