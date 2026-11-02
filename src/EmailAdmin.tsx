import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mail, RefreshCw, Send } from 'lucide-react';
import { callWorkspaceApi } from './storage';
import { mailKinds, mailLabels, renderWorkspaceEmail } from '../supabase/functions/_shared/workspace-email';
import type { MailKind, EmailContent } from '../supabase/functions/_shared/workspace-email';
import type { WorkspaceMember } from './types';

type Settings = { enabled: boolean; monthly_enabled: boolean; onboarding_enabled: boolean };
type Delivery = { id: string; member_id: string; recipient: string; content: EmailContent; status: string; attempts: number; created_at: string; sent_at: string | null; last_error: string | null };
type Snapshot = { installed: boolean; configured: boolean; settings: Settings | null; messages: Delivery[] };
const initialSettings: Settings = { enabled: false, monthly_enabled: false, onboarding_enabled: false };
export function EmailAdmin({ members, sessionToken, onBack }: { members: WorkspaceMember[]; sessionToken?: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [kind, setKind] = useState<MailKind>('announcement');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const eligible = members.filter(m => m.status !== 'suspended' && (m.entraEmail || m.personalEmail));
  const content: EmailContent = { kind, name: 'Alex', ...(kind === 'announcement' ? { title: title || 'Workspace announcement', message: message || 'Your update from Flat Reality will appear here.' } : {}), ...(until ? { until } : {}), ...(kind === 'monthly_summary' ? { period: 'October 2026', hours: 42.5, xp: 50, totalXp: 250 } : {}) };
  const preview = renderWorkspaceEmail(content, `${window.location.origin}${import.meta.env.BASE_URL}`);
  async function api<T>(command: string, values: Record<string, unknown> = {}) {
    if (!sessionToken) throw new Error('Sign in to the connected Workspace to manage email.');
    return callWorkspaceApi<T>({ action: 'email', command, sessionToken, ...values });
  }
  async function refresh() {
    const data = await api<Snapshot>('status');
    setSnapshot(data);
    setSettings(data.settings || initialSettings);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true); setFeedback('');
    try { await task(); } catch (error) { setFeedback(error instanceof Error ? error.message : 'Email action failed.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void run(refresh); }, [sessionToken]);
  useEffect(() => { setConfirm(false); requestId.current = crypto.randomUUID(); }, [title, message, selected, kind, until]);
  const ready = snapshot?.installed && snapshot.configured && snapshot.settings?.enabled;
  const field = 'w-full rounded-lg border border-line bg-paper p-3 text-sm';
  return <div className="grid gap-5">
    <button onClick={onBack} className="inline-flex items-center gap-2 justify-self-start text-sm"><ArrowLeft size={16} /> Back to administration</button>
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-forest">Communications</p><h1 className="mt-2 text-3xl font-semibold">Workspace Email</h1><p className="mt-2 text-sm text-zinc-500">FLAT REALITY ENTERTAINMENT GROUP &lt;hr@flatreality.eu&gt;</p></div><button aria-label="Refresh email status" disabled={busy} onClick={() => void run(refresh)}><RefreshCw size={20} /></button></div>
      {feedback && <p role="status" className="mt-4 rounded-lg border border-line bg-mist p-3 text-sm">{feedback}</p>}
      {snapshot && (!snapshot.installed || !snapshot.configured) && <p className="mt-4 rounded-lg bg-forest/10 p-4 text-sm">{!snapshot.installed ? 'Email setup is pending. Templates are available to preview.' : 'Email storage is ready. Add the Purelymail credentials to finish setup.'}</p>}
      <div className="mt-5 flex flex-wrap gap-5">{([['enabled', 'Enable Workspace emails'], ['monthly_enabled', 'Monthly summary · +50 XP per full month'], ['onboarding_enabled', 'Weekly onboarding reminder']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings[key]} disabled={!snapshot?.installed || busy} onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))} />{label}</label>)}</div>
      <button disabled={!snapshot?.installed || busy} className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40" onClick={() => void run(async () => { await api('settings', { settings }); await refresh(); setFeedback('Email settings saved.'); })}>Save email settings</button>
      <p className="mt-3 text-xs text-zinc-500">New strikes, explanation requests and approved pause / mental health periods create notifications. Sick pay is a template only. XP bonuses that need review remain with HR.</p>
    </section>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="grid gap-4 rounded-xl border border-line bg-paper p-6 shadow-soft">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Mail size={21} /> Templates &amp; Announcements</h2>
        <label className="grid gap-2 text-sm">Template<select className={field} value={kind} onChange={e => setKind(e.target.value as MailKind)}>{mailKinds.map(k => <option key={k} value={k}>{mailLabels[k]}{k === 'sick_pay_approved' ? ' · not connected' : ''}</option>)}</select></label>
        {kind === 'announcement' && <><label className="grid gap-2 text-sm">Subject<input maxLength={180} className={field} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="grid gap-2 text-sm">Message<textarea maxLength={10000} rows={7} className={field} value={message} onChange={e => setMessage(e.target.value)} /></label></>}
        {kind === 'sabbatical_approved' && <label className="grid gap-2 text-sm">Approved through<input type="date" className={field} value={until} onChange={e => setUntil(e.target.value)} /></label>}
        {kind === 'monthly_summary' && <p className="text-xs text-zinc-500">Preview uses example figures. Scheduled emails use the previous calendar month's Workspace Timesheet hours and XP ledger. Upwork hours are tracked separately and are not included.</p>}
        <button disabled={!ready || busy} className="justify-self-start rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-40" onClick={() => void run(async () => { await api('test', { content, requestId: crypto.randomUUID() }); setFeedback('Test queued for your own account email. Delivery is processed every five minutes.'); await refresh(); })}>Send test to myself</button>
        {(kind === 'announcement' || kind === 'sabbatical_approved') && <>
          <div className="flex items-center justify-between text-sm"><strong>Recipients · {selected.length}</strong><button className="text-forest" onClick={() => setSelected(selected.length === eligible.length ? [] : eligible.map(m => m.id))}>{selected.length === eligible.length ? 'Clear' : 'Select all'}</button></div>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-line p-3">{eligible.map(m => <label key={m.id} className="flex items-start gap-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(m.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} /><span>{m.preferredName || m.fullName}<span className="block text-xs text-zinc-500">{m.entraEmail || m.personalEmail}</span></span></label>)}</div>
          {confirm ? <div className="rounded-lg bg-forest/10 p-4 text-sm"><p>Send this {kind === 'announcement' ? 'announcement' : 'sabbatical approval'} to {selected.length} selected participants?</p><div className="mt-3 flex gap-4"><button disabled={busy} className="font-semibold text-forest" onClick={() => void run(async () => { const result = await api<{ queued: number }>(kind === 'announcement' ? 'announce' : 'sabbatical', { title, message, until, memberIds: selected, requestId: requestId.current }); setConfirm(false); setSelected([]); setFeedback(`${result.queued} notifications queued. Delivery is processed every five minutes.`); await refresh(); })}>Confirm send</button><button disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></div> : <button disabled={!ready || busy || !selected.length || (kind === 'announcement' && (!title.trim() || !message.trim())) || (kind === 'sabbatical_approved' && !until)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-forest px-4 py-3 text-sm font-semibold text-white disabled:opacity-40" onClick={() => setConfirm(true)}><Send size={16} /> Review recipients &amp; send</button>}
        </>}
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-paper shadow-soft"><p className="border-b border-line p-4 text-sm font-medium">Email preview</p><iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[850px] w-full border-0 bg-white" /></section>
    </div>
    <section className="overflow-hidden rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Delivery history</h2><p className="mt-2 text-xs text-zinc-500">Sent means accepted by the mail server. Uncertain deliveries require checking the mailbox before sending again.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line"><th className="p-2">Created</th><th className="p-2">Recipient</th><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Details</th></tr></thead><tbody>{snapshot?.messages.map(row => <tr key={row.id} className="border-b border-line"><td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.recipient}</td><td className="p-2">{row.content.title || mailLabels[row.content.kind]}</td><td className="p-2">{row.status}</td><td className="p-2"><span className="text-xs text-zinc-500">{row.last_error}</span>{['pending', 'failed', 'uncertain'].includes(row.status) && <button disabled={busy} className="ml-3 text-xs text-forest" onClick={() => void run(async () => { await api('cancel', { id: row.id }); await refresh(); })}>Cancel</button>}</td></tr>)}</tbody></table>{!snapshot?.messages.length && <p className="py-6 text-sm text-zinc-500">No email deliveries yet.</p>}</div></section>
  </div>;
}
