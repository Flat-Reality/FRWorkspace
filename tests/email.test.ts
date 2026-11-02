import { escapeHtml, mailKinds, recordedHours, renderWorkspaceEmail, validEmail } from '../supabase/functions/_shared/workspace-email.ts';
function assert(condition: unknown, message = 'Assertion failed') { if (!condition) throw new Error(message); }
Deno.test('every template renders accessible HTML and plain text with the approved sender footer', () => {
  for (const kind of mailKinds) {
    const rendered = renderWorkspaceEmail({ kind, name: '<script>alert(1)</script>', period: '2026-10', xp: 50, totalXp: 250, hours: 42 });
    assert(rendered.html.includes('Flat Reality Workspace'));
    assert(rendered.html.includes('FLAT REALITY ENTERTAINMENT GROUP'));
    assert(!rendered.html.includes('<script>'));
    assert(rendered.text.includes('Open Workspace: https://workspace.flatreality.eu/'));
    assert(rendered.subject.length > 0);
  }
});
Deno.test('announcement text is escaped and cannot inject links, HTML, or email headers', () => {
  const result = renderWorkspaceEmail({ kind: 'announcement', title: 'Update\r\nBcc: target@example.org', message: '<img src=x onerror=alert(1)> & goodbye' });
  assert(!result.subject.includes('\n'));
  assert(!result.html.includes('<img src=x'));
  assert(escapeHtml('"\'&<>') === '&quot;&#39;&amp;&lt;&gt;');
  assert(!validEmail('a@example.org\r\nBcc:b@example.org'));
  assert(validEmail('hr@flatreality.eu'));
});
Deno.test('monthly hours include only the part of completed entries inside the period', () => {
  const hours = recordedHours([
    { start: '2026-09-30T23:00:00Z', end: '2026-10-01T01:00:00Z' },
    { start: '2026-10-31T23:00:00Z', end: '2026-11-01T01:00:00Z' },
    { start: 'invalid', end: 'invalid' },
    { start: '2026-10-10T01:00:00Z', end: '2026-10-10T00:00:00Z' },
  ], '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
  assert(hours === 2, `Expected 2 hours, got ${hours}`);
});
