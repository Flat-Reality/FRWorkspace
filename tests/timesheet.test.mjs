import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTimeCommand as apply,
  emptyTimesheet,
  dateKey,
  dayBounds,
  formatTime,
  secondsWithin,
  zonedInstant,
} from "../supabase/functions/_shared/timesheet.ts";
import { timesheetAction } from "../supabase/functions/workspace-api/timesheet-store.ts";

const actor = { upwork: false, projects: ["RAIN HEART"] };
const now = Date.parse("2026-10-30T12:00:00Z");
const manual = (id, start, end, extra = {}) => ({
  kind: "manual",
  id,
  start,
  end,
  noIssue: true,
  ...extra,
});

test("timer keeps running through stop and validation, ends at confirmation, confirms once", () => {
  let state = apply(emptyTimesheet(), { kind: "start", id: "one" }, actor, now);
  assert.equal(
    apply(state, { kind: "start", id: "one" }, actor, now + 1000),
    state,
  );
  assert.throws(
    () => apply(state, { kind: "start", id: "two" }, actor, now),
    /Finish/,
  );
  state = apply(state, { kind: "stop", id: "one" }, actor, now + 61950);
  assert.equal(state.entries.length, 0);
  assert.equal(state.timer.end, undefined);
  assert.equal(
    apply(state, { kind: "stop", id: "one" }, actor, now + 90000),
    state,
  );
  assert.throws(
    () => apply(state, { kind: "confirm", id: "one" }, actor, now + 62000),
    /GitHub/,
  );
  state = apply(
    state,
    {
      kind: "confirm",
      id: "one",
      issue: "https://github.com/flat/reality/issues/123",
      project: "RAIN HEART",
    },
    actor,
    now + 90000,
  );
  assert.equal(state.timer, null);
  assert.equal(secondsWithin(state.entries[0], -Infinity, Infinity), 90);
  assert.equal(formatTime(61.95), "00:01");
  assert.equal(
    apply(state, { kind: "confirm", id: "one" }, actor, now + 100000),
    state,
  );
});
test("manual time rejects overlaps, future dates, bad links, unassigned projects", () => {
  let state = apply(
    emptyTimesheet(),
    manual("a", "2026-10-29T09:00Z", "2026-10-29T10:00Z"),
    actor,
    now,
  );
  for (const command of [
    manual("b", "2026-10-29T09:30Z", "2026-10-29T10:30Z"),
    manual("b", "2026-10-31T09:00Z", "2026-10-31T10:00Z"),
    manual("b", "2026-10-29T10:00Z", "2026-10-29T09:00Z"),
    manual("b", "2026-10-29T10:00Z", "2026-10-29T11:00Z", {
      noIssue: false,
      issue: "https://github.com/org/repo/pull/123",
    }),
    manual("b", "2026-10-29T10:00Z", "2026-10-29T11:00Z", {
      project: "The Nick",
    }),
    manual("b", "2026-10-27T10:00Z", "2026-10-28T11:00Z"),
  ])
    assert.throws(() => apply(state, command, actor, now));
  state = apply(
    state,
    manual("b", "2026-10-29T10:00Z", "2026-10-29T11:00Z", { issue: "ignored" }),
    actor,
    now,
  );
  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[1].issue, "");
  state = apply(state, { kind: "start", id: "active" }, actor, now - 3600000);
  assert.throws(
    () =>
      apply(
        state,
        manual("c", "2026-10-30T11:30Z", "2026-10-30T12:00Z"),
        actor,
        now,
      ),
    /current timer/,
  );
});
test("Upwork cannot start, stop, confirm or manually add through the API", () => {
  for (const kind of ["start", "stop", "confirm", "manual"])
    assert.throws(
      () =>
        apply(
          emptyTimesheet(),
          { kind, id: "a" },
          { ...actor, upwork: true },
          now,
        ),
      /Upwork/,
    );
  assert.deepEqual(
    apply(
      emptyTimesheet(),
      { kind: "snapshot" },
      { ...actor, upwork: true },
      now,
    ),
    emptyTimesheet(),
  );
});
test("midnight splits correctly and Madrid DST days are 23 and 25 hours", () => {
  const entry = { start: "2026-10-29T22:30:15Z", end: "2026-10-29T23:30:45Z" };
  assert.equal(dateKey(Date.parse(entry.start), "Europe/Madrid"), "2026-10-29");
  assert.equal(
    secondsWithin(entry, ...dayBounds("2026-10-29", "Europe/Madrid")),
    1785,
  );
  assert.equal(
    secondsWithin(entry, ...dayBounds("2026-10-30", "Europe/Madrid")),
    1845,
  );
  for (const [day, hours] of [
    ["2026-03-29", 23],
    ["2026-10-25", 25],
  ]) {
    const [start, end] = dayBounds(day, "Europe/Madrid");
    assert.equal((end - start) / 3600000, hours);
  }
  assert.ok(Number.isNaN(zonedInstant("2026-03-29", "02:30", "Europe/Madrid")));
  assert.equal(formatTime(3599.99), "00:59");
  assert.equal(formatTime(3600), "01:00");
});

// Exercise the real repository adapter against an atomic in-memory database surface.
function database() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, "workspace_timesheets");
      let operation = "read",
        payload,
        filters = {};
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters[key] = value;
          return q;
        },
        maybeSingle() {
          return Promise.resolve({
            data: structuredClone(rows.get(filters.member_id) ?? null),
            error: null,
          });
        },
        insert(value) {
          operation = "insert";
          payload = value;
          return q;
        },
        update(value) {
          operation = "update";
          payload = value;
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              if (operation === "insert") {
                if (rows.has(payload.member_id))
                  return { error: { code: "23505" } };
                rows.set(payload.member_id, structuredClone(payload));
                return { error: null };
              }
              const row = rows.get(filters.member_id);
              if (row?.revision !== filters.revision)
                return { data: [], error: null };
              rows.set(filters.member_id, {
                ...row,
                ...structuredClone(payload),
              });
              return { data: [{ member_id: filters.member_id }], error: null };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
  };
}
test("database isolates members and compare-and-swap allows only one concurrent timer", async () => {
  const db = database();
  const member = { id: "alice", benefitPrograms: [], onboarding: {} };
  const results = await Promise.allSettled(
    ["one", "two"].map((id) =>
      timesheetAction(db, member, { kind: "start", id }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const state = await timesheetAction(db, member, { kind: "snapshot" });
  assert.ok(state.timer);
  assert.deepEqual(
    await timesheetAction(db, { ...member, id: "bob" }, { kind: "snapshot" }),
    emptyTimesheet(),
  );
  assert.equal(db.rows.size, 1);
  assert.equal(db.rows.get("alice").revision, 1);
  await timesheetAction(db, member, { kind: "stop", id: state.timer.id });
  await timesheetAction(db, member, {
    kind: "confirm",
    id: state.timer.id,
    noIssue: true,
  });
  await Promise.all([
    timesheetAction(
      db,
      member,
      manual("manual-a", "2026-10-28T09:00Z", "2026-10-28T10:00Z"),
    ),
    timesheetAction(
      db,
      member,
      manual("manual-b", "2026-10-28T10:00Z", "2026-10-28T11:00Z"),
    ),
  ]);
  const confirmed = await timesheetAction(db, member, { kind: "snapshot" });
  assert.equal(
    confirmed.entries.length,
    3,
    "Concurrent saves must keep both entries",
  );
  assert.equal(db.rows.get("alice").revision, 4);
});
