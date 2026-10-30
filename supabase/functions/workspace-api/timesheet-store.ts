import { applyTimeCommand, emptyTimesheet } from "../_shared/timesheet.ts";
import type { TimeCommand, Timesheet } from "../_shared/timesheet.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// A separate per-member row keeps diary writes independent of workspace autosave.
// Compare-and-swap prevents two tabs/devices from starting duplicate timers.
export async function timesheetAction(
  db: SupabaseClient,
  member: {
    id: string;
    onboarding?: Record<string, unknown>;
    benefitPrograms?: string[];
  },
  command: TimeCommand,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("workspace_timesheets")
      .select("document, revision")
      .eq("member_id", member.id)
      .maybeSingle();
    if (error) throw error;
    const current = (data?.document ?? emptyTimesheet()) as Timesheet;
    const next = applyTimeCommand(current, command, {
      upwork: member.onboarding?.contractType === "UPWORK CONTRACT",
      projects: member.benefitPrograms ?? [],
    });
    if (next === current) return current;
    if (!data) {
      const inserted = await db
        .from("workspace_timesheets")
        .insert({ member_id: member.id, document: next, revision: 1 });
      if (!inserted.error) return next;
      if (inserted.error.code === "23505") continue;
      throw inserted.error;
    }
    const saved = await db
      .from("workspace_timesheets")
      .update({
        document: next,
        revision: data.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", member.id)
      .eq("revision", data.revision)
      .select("member_id");
    if (saved.error) throw saved.error;
    if (saved.data?.length) return next;
  }
  throw new Error("Timesheet changed in another session. Please try again.");
}
