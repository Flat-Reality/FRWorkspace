export const mailKinds = ['explanation_request', 'strike', 'pause_approved', 'sick_pay_approved', 'mental_health_approved', 'sabbatical_approved', 'monthly_summary', 'onboarding_reminder', 'announcement'] as const;
export type MailKind = typeof mailKinds[number];
export type EmailContent = { kind: MailKind; name?: string; title?: string; message?: string; until?: string; period?: string; hours?: number; xp?: number; totalXp?: number };
export const mailLabels: Record<MailKind, string> = {
  explanation_request: 'Request for explanation', strike: 'Work record update', pause_approved: 'Your pause is approved',
  sick_pay_approved: 'Your sick pay is approved', mental_health_approved: 'Your mental health days are approved',
  sabbatical_approved: 'Your sabbatical is approved', monthly_summary: 'Your month with Flat Reality',
  onboarding_reminder: 'Complete your onboarding', announcement: 'Workspace announcement',
};
const banners: Record<MailKind, string> = {
  explanation_request: 'explanation', strike: 'strike', pause_approved: 'time-off', sick_pay_approved: 'sick-pay',
  mental_health_approved: 'time-off', sabbatical_approved: 'time-off', monthly_summary: 'monthly', onboarding_reminder: 'onboarding', announcement: '',
};
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);
}
export function renderWorkspaceEmail(content: EmailContent, baseUrl = 'https://workspace.flatreality.eu') {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Workspace URL must use HTTPS.');
  const title = content.title || mailLabels[content.kind];
  const greeting = `Hi ${content.name || 'there'},`;
  const copy: Record<MailKind, string> = {
    explanation_request: 'HR has requested an explanation. Please open your Work Records in Workspace to review the request and submit your response.',
    strike: 'A strike has been added to your Work Records. Open Workspace to review the details. If you have questions, contact HR.',
    pause_approved: 'Your pause period has been approved.',
    sick_pay_approved: 'Your sick pay has been approved and will be included in your next payroll.',
    mental_health_approved: 'Your mental health days have been approved. Take the time you need to rest.',
    sabbatical_approved: 'Your sabbatical has been approved.',
    monthly_summary: `Here is your summary for ${content.period || 'the past month'}. Thank you for being part of Flat Reality.`,
    onboarding_reminder: 'There are still steps to complete in your onboarding. Open Workspace to review your checklist and finish the remaining steps.',
    announcement: content.message || 'You have a new update from Flat Reality.',
  };
  const paragraphs = [greeting, copy[content.kind]];
  if (content.kind !== 'announcement' && content.message) paragraphs.push(content.message);
  if (content.until) paragraphs.push(`Approved through: ${content.until}.`);
  if (content.kind === 'monthly_summary') {
    paragraphs.push(`Recorded Workspace hours: ${Number(content.hours || 0).toFixed(2)} h`, `LevelUp! XP awarded: +${Number(content.xp || 0)}`, `Total LevelUp! XP: ${Number(content.totalXp || 0)}`);
  }
  const link = base.href;
  const text = `${title}\n\n${paragraphs.join('\n\n')}\n\nOpen Workspace: ${link}\n\nFlat Reality Workspace\nFLAT REALITY ENTERTAINMENT GROUP\nhr@flatreality.eu`;
  const banner = banners[content.kind];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:24px 12px;background:#f4f4f5;color:#18181b;font-family:Inter,Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px;border-bottom:1px solid #e4e4e7;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#7f00ff">FLAT REALITY WORKSPACE</td></tr>${banner ? `<tr><td><img alt="" src="${escapeHtml(new URL(`email/${banner}.jpg`, base).href)}" width="600" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}<tr><td style="padding:32px"><h1 style="margin:0 0 24px;font-size:28px;line-height:1.25;font-weight:600">${escapeHtml(title)}</h1>${paragraphs.map(p => `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;white-space:pre-line">${escapeHtml(p)}</p>`).join('')}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px"><tr><td bgcolor="#7f00ff" style="border-radius:8px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:600">Open Workspace</a></td></tr></table></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;line-height:1.8"><strong style="color:#18181b">Flat Reality Workspace</strong><br>FLAT REALITY ENTERTAINMENT GROUP<br><a href="mailto:hr@flatreality.eu" style="color:#7f00ff;text-decoration:none">hr@flatreality.eu</a><br>This is a service notification about your Flat Reality Workspace account.</td></tr></table></td></tr></table></body></html>`;
  return { subject: title.replace(/[\r\n]/g, ' ').slice(0, 180), html, text };
}

// Split entries at month boundaries; exclude running timers and time outside the period.
export function recordedHours(entries: Array<{ start: string; end: string }>, from: string, until: string): number {
  const a = Date.parse(from), b = Date.parse(until);
  const ms = entries.reduce((sum, entry) => {
    const start = Date.parse(entry.start), end = Date.parse(entry.end);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + Math.max(0, Math.min(end, b) - Math.max(start, a)) : sum;
  }, 0);
  return Math.round(ms / 36000) / 100;
}
