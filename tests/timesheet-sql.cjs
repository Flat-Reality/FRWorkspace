// Validate the migration and privileges against local Postgres via PGlite.
// Set PGLITE_MODULE to an installed @electric-sql/pglite package.
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261030133450_workspace_timesheets.sql",
      "utf8",
    ),
  );
  assert.equal(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid = 'public.workspace_timesheets'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  await db.exec("set role service_role");
  await db.exec(
    "insert into public.workspace_timesheets(member_id) values ('alice')",
  );
  assert.equal(
    (await db.query("select document from public.workspace_timesheets")).rows[0]
      .document.timer,
    null,
  );
  await db.exec(
    "update public.workspace_timesheets set revision = revision + 1 where member_id = 'alice' and revision = 0",
  );
  assert.equal(
    (await db.query("select revision from public.workspace_timesheets")).rows[0]
      .revision,
    1,
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(
      db.query("select * from public.workspace_timesheets"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(
        "insert into public.workspace_timesheets(member_id) values ('intruder')",
      ),
      /permission denied/,
    );
  }
  await db.exec("reset role");
  await assert.rejects(
    db.exec(
      "insert into public.workspace_timesheets(member_id, document) values ('broken', '{}')",
    ),
    /timesheet_document_shape/,
  );
  await db.close();
  console.log(
    "SQL checks passed: schema, RLS, service access, denied anonymous/authenticated access, document constraint.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
