// Shared by the API and local development adapter. All timestamps are UTC instants.
export type TimeEntry = {
  id: string;
  start: string;
  end: string;
  source: "tracked" | "manual";
  issue: string;
  noIssue: boolean;
  project: string;
};
export type TimeTimer = { id: string; start: string; end?: string };
export type Timesheet = { entries: TimeEntry[]; timer: TimeTimer | null };
export type TimeCommand = {
  kind: "snapshot" | "start" | "stop" | "confirm" | "manual";
  id?: string;
  start?: string;
  end?: string;
  issue?: string;
  noIssue?: boolean;
  project?: string;
};
export const emptyTimesheet = (): Timesheet => ({ entries: [], timer: null });
export const isIssueLink = (value: string) =>
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*\/?(?:[?#].*)?$/.test(
    value,
  );

export function applyTimeCommand(
  state: Timesheet,
  command: TimeCommand,
  actor: { upwork: boolean; projects: string[] },
  now = Date.now(),
): Timesheet {
  if (!command || typeof command !== "object")
    throw new Error("A timesheet action is required.");
  if (command.kind === "snapshot") return state;
  if (actor.upwork) throw new Error("Track time on your Upwork contract.");
  if (typeof command.id !== "string" || !/^[\w-]{1,100}$/.test(command.id))
    throw new Error("A valid tracking ID is required.");
  if (state.entries.some((entry) => entry.id === command.id)) return state; // Safe retry after a lost response.
  if (command.kind === "start") {
    if (state.timer?.id === command.id) return state;
    if (state.timer) throw new Error("Finish your current time entry first.");
    return {
      ...state,
      timer: { id: command.id, start: new Date(now).toISOString() },
    };
  }
  if (command.kind === "stop") {
    if (state.timer?.id !== command.id)
      throw new Error("This timer is no longer active. Refresh and try again.");
    if (state.timer.end) return state;
    return {
      ...state,
      timer: {
        ...state.timer,
        end: new Date(
          Math.max(now, Date.parse(state.timer.start) + 1),
        ).toISOString(),
      },
    };
  }
  if (command.kind !== "confirm" && command.kind !== "manual")
    throw new Error("Unknown timesheet action.");
  const timer = command.kind === "confirm" ? state.timer : null;
  if (command.kind === "confirm" && (!timer?.end || timer.id !== command.id))
    throw new Error("Stop the timer before confirming.");
  const start = Date.parse(timer?.start ?? command.start ?? "");
  const end = Date.parse(timer?.end ?? command.end ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error("End time must be after start time.");
  if (end > now + 1000)
    throw new Error("Time entries cannot be in the future.");
  if (command.kind === "manual" && end - start > 86400000)
    throw new Error("Add at most 24 hours in one manual entry.");
  const issue =
    command.noIssue === true ? "" : String(command.issue ?? "").trim();
  if (command.noIssue !== true && !isIssueLink(issue))
    throw new Error(
      "Enter a GitHub issue URL or select “I don’t have this link”.",
    );
  const project = String(command.project ?? "");
  if (project && !actor.projects.includes(project))
    throw new Error("Choose one of your assigned projects.");
  if (
    state.entries.some(
      (entry) => start < Date.parse(entry.end) && end > Date.parse(entry.start),
    )
  )
    throw new Error("This period overlaps time already in your diary.");
  if (
    command.kind === "manual" &&
    state.timer &&
    start < Date.parse(state.timer.end ?? new Date(now).toISOString()) &&
    end > Date.parse(state.timer.start)
  )
    throw new Error("This period overlaps your current timer.");
  const entry: TimeEntry = {
    id: command.id,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    source: command.kind === "manual" ? "manual" : "tracked",
    issue,
    noIssue: command.noIssue === true,
    project,
  };
  return {
    entries: [...state.entries, entry].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    timer: command.kind === "confirm" ? null : state.timer,
  };
}

export function safeTimeZone(zone?: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
export function dateKey(instant: number | Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
export function addDateDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function monday(key: string) {
  return addDateDays(
    key,
    -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
}
// Resolve a wall-clock time in the member's zone, including DST offset changes.
// Reject nonexistent spring-forward times instead of silently moving them.
export function zonedInstant(key: string, time: string, zone: string) {
  const target = Date.parse(
    `${key}T${time.length === 5 ? `${time}:00` : time}Z`,
  );
  if (!Number.isFinite(target)) return NaN;
  let result = target;
  for (let i = 0; i < 5; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(result);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    const delta = target - represented;
    if (!delta) return result;
    result += delta;
  }
  return NaN;
}
export function dayBounds(key: string, zone: string): [number, number] {
  return [
    zonedInstant(key, "00:00", zone),
    zonedInstant(addDateDays(key, 1), "00:00", zone),
  ];
}
export function secondsWithin(
  entry: { start: string; end: string },
  from: number,
  to: number,
) {
  return (
    Math.max(
      0,
      Math.min(Date.parse(entry.end), to) -
        Math.max(Date.parse(entry.start), from),
    ) / 1000
  );
}
export function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
