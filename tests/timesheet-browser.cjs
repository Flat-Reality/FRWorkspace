// npm install -D playwright, or set PLAYWRIGHT_MODULE to an existing Playwright package.
// Run a local Vite server first; all external integrations are replaced with test fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.TIMESHEET_TEST_URL || "http://127.0.0.1:5174";
const output = path.resolve("outputs/timesheet");
fs.mkdirSync(output, { recursive: true });
const fixture = `
import { emptyMember, initialLevels, initialRewards, initialGuidePages, initialFileProjects } from '/src/data.ts';
import { applyTimeCommand, emptyTimesheet } from '/supabase/functions/_shared/timesheet.ts';
const config = window.__testConfig;
const member = { ...emptyMember, id: 'qa-member', employmentId: 'QA-1001', fullName: 'Taylor Morgan', preferredName: 'Taylor', workStartDate: '2025-01-01', timeZone: 'Europe/Madrid', benefitPrograms: ['FR Partners', 'RAIN HEART'], scheduleEnabled: config.schedule, onboarding: { ...emptyMember.onboarding, completed: true, contractType: config.upwork ? 'UPWORK CONTRACT' : 'MASTER SERVICE AGREEMENT' } };
let state = { members: [member], levels: initialLevels, rewards: initialRewards, guidePages: initialGuidePages, workRecords: [], scheduleShifts: [], scheduleCompletions: [], fileProjects: initialFileProjects, teamsInvites: [] };
const upwork = { eligible: true, connected: config.upwork, available: true, connectionStatus: 'connected', message: '', lastSyncedAt: '2026-10-30T12:00:00Z', profile: null, contracts: [{ id: 'contract', title: 'Test contract', type: 'hourly', weeklyLimit: 2, status: 'Active', rate: null }], payments: null, timeEntries: config.upwork ? [{ id: 'upwork-entry', date: '2026-10-30', hours: 3.5, charges: 999.99, currency: 'USD', contractId: 'contract', contractTitle: 'Test contract', memo: 'Prototype work' }] : [] };
export const isSupabaseConfigured = true;
export const supabase = { functions: { async invoke(name, { body }) {
  try {
    if (name === 'upwork-oauth') return { data: { snapshot: upwork }, error: null };
    if (body.action === 'load') return { data: { state }, error: null };
    if (body.action === 'policy_status') return { data: { consentRequired: false }, error: null };
    if (body.action === 'save') { state = body.state; return { data: { state, entraSyncWarnings: [] }, error: null }; }
    if (body.action === 'timesheet') {
      if (window.__failTimesheet && body.command.kind === 'confirm') throw new Error('Test network failure. Try again.');
      const raw = localStorage.getItem('qa-timesheet');
      const next = applyTimeCommand(raw ? JSON.parse(raw) : emptyTimesheet(), body.command, { upwork: config.upwork, projects: member.benefitPrograms });
      localStorage.setItem('qa-timesheet', JSON.stringify(next));
      return { data: { timesheet: next }, error: null };
    }
    return { data: {}, error: null };
  } catch (error) { return { data: { error: error.message }, error: null }; }
} }, auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null }, error: null }) } };
`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [];
  async function setup(
    config,
    viewport = { width: 1440, height: 1080 },
    colorScheme = "light",
  ) {
    const context = await browser.newContext({ viewport, colorScheme });
    await context.route("**/src/supabase.ts", (route) =>
      route.fulfill({ contentType: "application/javascript", body: fixture }),
    );
    await context.route(/^https:\/\//, (route) => route.abort());
    await context.addInitScript((config) => {
      window.__testConfig = config;
      localStorage.setItem(
        "flat-reality-workspace-session",
        JSON.stringify({
          token: "qa-only",
          memberId: "qa-member",
          expiresAt: Date.now() + 86400000,
        }),
      );
      window.__sounds = [];
      const NativeAudio = window.Audio;
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args);
        audio.addEventListener("play", () => window.__sounds.push(audio.src));
        return audio;
      };
      window.Audio.prototype = NativeAudio.prototype;
    }, config);
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-10-30T12:00:00Z') });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Timesheet", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", {
        name: config.upwork ? "Today" : "Start tracking",
        exact: true,
      })
      .waitFor();
    return { context, page };
  }
  try {
    const { context, page } = await setup({ upwork: false, schedule: false });
    assert.equal(
      await page.getByRole("tab", { name: "Schedue", exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Start tracking", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Stop tracking", exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      window.__sounds.some((x) => x.includes("tracking-start.wav")),
    );
    await page.waitForFunction(() => document.title.includes("Tracking"));
    await page
      .getByRole("button", { name: "Home", exact: true })
      .first()
      .click();
    assert.match(await page.title(), /Tracking/);
    await page.reload();
    await page
      .getByRole("button", { name: "Timesheet", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Stop tracking", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Stop tracking", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(
      await page.evaluate(
        () => window.__sounds.filter((x) => x.includes("confirm")).length,
      ),
      0,
    );
    await page
      .getByRole("button", { name: "Finish later", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Timesheet", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Review tracked time" }).click();
    await page
      .getByRole("checkbox", { name: "I don't have this link" })
      .check();
    assert.ok(
      await dialog
        .getByRole("textbox", { name: "GitHub issue link" })
        .isDisabled(),
    );
    await dialog.locator("summary").click();
    assert.equal(
      await dialog
        .getByRole("button", { name: "The Nick", exact: true })
        .count(),
      0,
    );
    await dialog
      .getByRole("button", { name: "RAIN HEART", exact: true })
      .click();
    await page.evaluate(() => {
      window.__failTimesheet = true;
    });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "Test network failure" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("qa-timesheet")).entries.length,
      ),
      0,
    );
    await page.evaluate(() => {
      window.__failTimesheet = false;
    });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      window.__sounds.some((x) => x.includes("tracking-confirm.wav")),
    );
    assert.doesNotMatch(await page.title(), /Tracking/);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("qa-timesheet")).entries.length,
      ),
      1,
    );

    await page
      .getByRole("button", { name: "+ Add tracked time", exact: true })
      .click();
    await dialog.getByLabel("Start date", { exact: true }).fill("2026-10-29");
    await dialog.getByLabel("End date", { exact: true }).fill("2026-10-29");
    await dialog
      .getByRole("textbox", { name: "GitHub issue link" })
      .fill("https://example.com/not-an-issue");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await dialog
      .getByRole("textbox", { name: "GitHub issue link" })
      .fill("https://github.com/flat/reality/issues/42");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("qa-timesheet")).entries.length,
      ),
      2,
    );
    await page.getByRole("button", { name: /View Oct 29/ }).click();
    await page.getByRole("link", { name: "Issue #42" }).waitFor();
    await page.screenshot({
      path: path.join(output, "desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "mobile.png"),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Mobile page overflow",
    );
    await page
      .getByRole("button", { name: "+ Add tracked time", exact: true })
      .click();
    const bounds = await dialog.boundingBox();
    assert.ok(
      bounds && bounds.y >= 0 && bounds.y + bounds.height <= 845,
      "Dialog must fit the mobile viewport",
    );
    await page.screenshot({
      path: path.join(output, "manual-dialog-mobile.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await context.close();

    const experimental = await setup({ upwork: false, schedule: true });
    await experimental.page
      .getByRole("tab", { name: "Schedue", exact: true })
      .click();
    await experimental.page
      .getByText("SCHEDULE BETA", { exact: true })
      .waitFor();
    await experimental.page.keyboard.press('Home');
    await experimental.page.getByRole('tab', { name: 'Timesheet', exact: true }).waitFor();
    assert.equal(await experimental.page.getByRole('tab', { name: 'Timesheet', exact: true }).getAttribute('aria-selected'), 'true');
    await experimental.context.close();
    const uw = await setup(
      { upwork: true, schedule: true },
      { width: 1440, height: 1080 },
      "dark",
    );
    await uw.page.getByRole("link", { name: "Open Upwork" }).waitFor();
    assert.equal(
      await uw.page.getByRole("button", { name: "Start tracking" }).count(),
      0,
    );
    assert.equal(
      await uw.page
        .getByRole("button", { name: "+ Add tracked time", exact: true })
        .count(),
      0,
    );
    assert.doesNotMatch(
      await uw.page.locator("main").innerText(),
      /999|\$|earnings/i,
    );
    await uw.page.screenshot({
      path: path.join(output, "upwork-dark.png"),
      fullPage: true,
    });
    await uw.page.getByRole("tab", { name: "Schedue", exact: true }).click();
    assert.doesNotMatch(
      await uw.page.getByRole("tabpanel").innerText(),
      /999|\$|earnings/i,
    );
    await uw.context.close();
    assert.deepEqual(errors, []);
    console.log(
      "Browser checks passed: timer, reload, pending recovery, issue validation, project filtering, failure/retry, audio events, manual time, mobile, experiment, Upwork, no earnings.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
