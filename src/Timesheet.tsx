import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Github,
  Play,
  Square,
  X,
} from "lucide-react";
import {
  addDateDays,
  dateKey,
  dayBounds,
  formatTime,
  isIssueLink,
  monday,
  safeTimeZone,
  secondsWithin,
  zonedInstant,
} from "../supabase/functions/_shared/timesheet";
import type { TimeEntry } from "../supabase/functions/_shared/timesheet";
import type { BenefitProgram, UpworkSnapshot, WorkspaceMember } from "./types";
import type { TimesheetController } from "./useTimesheet";

const asset = (file: string) => `${import.meta.env.BASE_URL}resources/${file}`;
const projectIcons: Record<string, string> = {
  "FR Partners": "partners.png",
  "RAIN HEART": "rain-heart.png",
  "The Nick": "the-nick.png",
};
const projectName = (name: string) =>
  name === "FR Partners" ? "Partners" : name;
const dateLabel = (
  key: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
const clock = (instant: string, zone: string) =>
  new Date(instant).toLocaleTimeString("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50";

export function TimesheetPage({
  member,
  upwork,
  controller: c,
  schedule,
}: {
  member: WorkspaceMember;
  upwork: UpworkSnapshot;
  controller: TimesheetController;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<"timesheet" | "schedule">("timesheet");
  const [modal, setModal] = useState<"tracked" | "manual" | null>(null);
  const zone = safeTimeZone(member.timeZone);
  const today = dateKey(c.now, zone);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const upworkMode = member.onboarding.contractType === "UPWORK CONTRACT";
  const timer = c.data.timer;
  const running = Boolean(timer && !timer.end);
  const live: TimeEntry[] = timer
    ? [
        {
          ...timer,
          end: timer.end ?? new Date(c.now).toISOString(),
          source: "tracked",
          issue: "",
          noIssue: true,
          project: "",
        },
      ]
    : [];
  const entries = [...c.data.entries, ...live];
  const weeklyLimit = upworkMode
    ? upwork.contracts
        .filter(
          (contract) =>
            contract.status === "Active" && contract.type === "hourly",
        )
        .reduce((total, contract) => total + (contract.weeklyLimit ?? 0), 0)
    : 0;
  function totals(from: number, to: number, key?: string) {
    const local = entries.reduce(
      (total, entry) => total + secondsWithin(entry, from, to),
      0,
    );
    // Upwork reports dates and total hours, not start/end instants. Keep that precision explicit.
    const remote = upworkMode
      ? upwork.timeEntries
          .filter((entry) =>
            key
              ? entry.date.slice(0, 10) === key
              : entry.date.slice(0, 10) >= dateKey(from, zone) &&
                entry.date.slice(0, 10) < dateKey(to, zone),
          )
          .reduce((total, entry) => total + entry.hours * 3600, 0)
      : 0;
    return local + remote;
  }
  const boundsCache = new Map<string, [number, number]>();
  const range = (key: string) => {
    if (!boundsCache.has(key)) boundsCache.set(key, dayBounds(key, zone));
    return boundsCache.get(key)!;
  };
  const totalCache = new Map<string, number>();
  const dayTotal = (key: string) => {
    if (!totalCache.has(key))
      totalCache.set(key, totals(...range(key), key));
    return totalCache.get(key)!;
  };
  const week = monday(selected);
  const currentWeek = monday(today);
  const sumWeek = (key: string) =>
    Array.from({ length: 7 }, (_, i) => dayTotal(addDateDays(key, i))).reduce(
      (a, b) => a + b,
      0,
    );
  const overtimeForDay = (key: string) => {
    if (!weeklyLimit) return 0;
    let cumulative = 0;
    for (let day = monday(key); day <= key; day = addDateDays(day, 1))
      cumulative += dayTotal(day);
    return Math.min(
      dayTotal(key),
      Math.max(0, cumulative - weeklyLimit * 3600),
    );
  };
  const weekSeconds = sumWeek(week);
  const monthStart = `${month}-01`;
  const gridStart = monday(monthStart);
  const daysInGrid =
    Math.ceil(
      (((new Date(`${monthStart}T12:00Z`).getUTCDay() + 6) % 7) +
        new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
        ).getUTCDate()) /
        7,
    ) * 7;
  const allSeconds =
    entries.reduce(
      (total, entry) => total + secondsWithin(entry, -Infinity, Infinity),
      0,
    ) +
    (upworkMode
      ? upwork.timeEntries.reduce(
          (total, entry) => total + entry.hours * 3600,
          0,
        )
      : 0);
  const changeSelection = (key: string) => {
    setSelected(key);
    setMonth(key.slice(0, 7));
  };
  const chooseMonth = (delta: number) => {
    const d = new Date(`${monthStart}T12:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };
  useEffect(() => {
    if (!member.scheduleEnabled) setTab("timesheet");
  }, [member.scheduleEnabled]);

  async function stop() {
    if (timer && (await c.execute({ kind: "stop", id: timer.id })))
      setModal("tracked");
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Timesheet</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Track your time and review your work diary.
        </p>
      </header>
      <div
        className="flex gap-6 border-b border-line"
        role="tablist"
        aria-label="Timesheet views"
      >
        {(
          [
            "timesheet",
            ...(member.scheduleEnabled ? ["schedule"] : []),
          ] as const
        ).map((key) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === key ? "border-forest text-forest" : "border-transparent text-zinc-500"}`}
            onClick={() => setTab(key as "timesheet" | "schedule")}
            onKeyDown={(event) => {
              if (
                !member.scheduleEnabled ||
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "timesheet"
                  : event.key === "End"
                    ? "schedule"
                    : tab === "timesheet"
                      ? "schedule"
                      : "timesheet";
              setTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {key === "timesheet" ? "Timesheet" : "Schedule"}
          </button>
        ))}
      </div>
      {c.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{c.error}</span>
          <button
            className="font-semibold underline"
            onClick={() => void c.refresh()}
          >
            Retry
          </button>
        </div>
      )}
      {tab === "schedule" && member.scheduleEnabled ? (
        <div id="panel-schedule" role="tabpanel" aria-labelledby="tab-schedule">
          {schedule}
        </div>
      ) : (
        <div
          id="panel-timesheet"
          role="tabpanel"
          aria-labelledby="tab-timesheet"
          className="grid gap-6"
        >
          <section className="rounded-xl border border-line bg-paper px-6 py-8 shadow-soft sm:px-8 sm:py-10">
            {upworkMode ? (
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div className="flex items-center gap-5">
                  <span className="flex w-28 shrink-0 items-center justify-center rounded-xl bg-black px-4 py-3">
                    <img
                      className="w-full brightness-0 invert"
                      src={asset("logos/upworklogo.webp")}
                      alt="Upwork"
                    />
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold">
                      Track time on Upwork
                    </h2>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">
                      You can track time only on your Upwork contract. Your
                      synced hours appear in the work diary below.
                    </p>
                  </div>
                </div>
                <a
                  className={`${button} shrink-0 bg-ink text-paper`}
                  href="https://www.upwork.com/nx/wm/workdiary/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Upwork
                  <ExternalLink size={16} />
                </a>
              </div>
            ) : (
              <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-center">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                    {running && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    )}
                    Tracked today
                  </p>
                  <p className="mt-3 text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl">
                    {formatTime(dayTotal(today))}
                  </p>
                  <button
                    disabled={!c.ready || c.busy}
                    className="mt-5 text-sm font-semibold text-forest disabled:opacity-50"
                    onClick={() => setModal("manual")}
                  >
                    + Add tracked time
                  </button>
                </div>
                <div className="sm:text-right">
                  <p className="mb-4 text-sm text-zinc-500">
                    {running
                      ? `Tracking since ${clock(timer!.start, zone)}`
                      : timer?.end
                        ? "Your tracked time is ready to confirm."
                        : "Ready when you are."}
                  </p>
                  {timer?.end ? (
                    <button
                      className={`${button} bg-forest text-white`}
                      disabled={c.busy}
                      onClick={() => setModal("tracked")}
                    >
                      Review tracked time
                    </button>
                  ) : (
                    <button
                      className={`${button} min-w-44 ${running ? "bg-ink text-paper" : "bg-forest text-white"}`}
                      disabled={!c.ready || c.busy}
                      onClick={() =>
                        running
                          ? void stop()
                          : void c.execute({
                              kind: "start",
                              id: crypto.randomUUID(),
                            })
                      }
                    >
                      {running ? (
                        <Square size={16} fill="currentColor" />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )}
                      {c.busy
                        ? "Saving…"
                        : running
                          ? "Stop tracking"
                          : "Start tracking"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section
            className="grid grid-cols-2 gap-6 rounded-xl border border-line bg-paper px-6 py-6 sm:grid-cols-4 sm:px-8"
            aria-label="Time summary"
          >
            {[
              [
                upworkMode ? "Today" : "Last 24 hours",
                upworkMode ? dayTotal(today) : totals(c.now - 86400000, c.now),
                upworkMode
                  ? "Daily totals from Upwork"
                  : "Rolling 24-hour total",
              ],
              [
                "This week",
                sumWeek(currentWeek),
                weeklyLimit ? `${weeklyLimit} hrs weekly limit` : "No limit",
              ],
              [
                "Last week",
                sumWeek(addDateDays(currentWeek, -7)),
                "Monday – Sunday",
              ],
              [
                upworkMode ? "Synced time" : "Since start",
                allSeconds,
                upworkMode ? "Available synced history" : "All recorded time",
              ],
            ].map(([label, total, hint]) => (
              <div key={String(label)}>
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {total === null ? "—" : `${formatTime(Number(total))} hrs`}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{hint}</p>
              </div>
            ))}
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-semibold">Work diary</h2>
              <p className="text-xs text-zinc-500">
                {zone}
                {upworkMode ? " · Upwork dates as reported" : ""}
              </p>
            </div>
            <div className="grid items-start gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
              <div className="rounded-xl border border-line bg-paper p-5">
                <div className="mb-5 flex items-center justify-between">
                  <button
                    aria-label="Previous month"
                    className="rounded-lg p-2 hover:bg-mist"
                    onClick={() => chooseMonth(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h3 className="font-semibold">
                    {dateLabel(monthStart, { month: "long", year: "numeric" })}
                  </h3>
                  <button
                    aria-label="Next month"
                    className="rounded-lg p-2 hover:bg-mist"
                    onClick={() => chooseMonth(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day) => (
                      <span
                        key={day}
                        className="pb-2 font-medium text-zinc-500"
                      >
                        {day}
                      </span>
                    ),
                  )}
                  {Array.from({ length: daysInGrid }, (_, index) => {
                    const key = addDateDays(gridStart, index);
                    const activeWeek =
                      key >= week && key <= addDateDays(week, 6);
                    const dayEntries = entries.filter(
                      (entry) =>
                        secondsWithin(entry, ...range(key)) > 0,
                    );
                    const remote =
                      upworkMode &&
                      upwork.timeEntries.some(
                        (entry) =>
                          entry.date.slice(0, 10) === key && entry.hours > 0,
                      );
                    const overtime = overtimeForDay(key) > 0;
                    return (
                      <button
                        key={key}
                        aria-label={`${dateLabel(key, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${formatTime(dayTotal(key))} hours`}
                        aria-pressed={key === selected}
                        className={`relative flex h-10 flex-col items-center justify-center rounded-full ${key === selected ? "bg-ink text-paper" : activeWeek ? "bg-forest/10 text-forest" : key.slice(0, 7) !== month ? "text-zinc-400" : "hover:bg-mist"} ${key === today ? "ring-1 ring-inset ring-forest" : ""}`}
                        onClick={() => changeSelection(key)}
                      >
                        <span>{Number(key.slice(8))}</span>
                        <span className="absolute bottom-1 flex h-1.5 items-center gap-0.5">
                          {(remote ||
                            dayEntries.some((e) => e.source === "tracked")) && (
                            <span className="h-1 w-1 rounded-full bg-[#14a800]" />
                          )}
                          {dayEntries.some((e) => e.source === "manual") && (
                            <span className="text-[7px] leading-none text-[#79bd6a]">
                              ▲
                            </span>
                          )}
                          {overtime && <span className="h-1 w-1 bg-red-400" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                  <span>
                    <b className="mr-1 text-[#14a800]">●</b> Tracked
                  </span>
                  <span>
                    <b className="mr-1 text-[#79bd6a]">▲</b> Manual
                  </span>
                  <span>
                    <b className="mr-1 text-red-400">■</b> Overtime
                  </span>
                </div>
                <button
                  className="mt-4 text-xs font-semibold text-forest"
                  onClick={() => changeSelection(today)}
                >
                  Today
                </button>
              </div>

              <div className="min-w-0 rounded-xl border border-line bg-paper p-5 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {dateLabel(week)} –{" "}
                      {dateLabel(addDateDays(week, 6), {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatTime(weekSeconds)} hrs this week
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-line p-2"
                      aria-label="Previous week"
                      onClick={() => changeSelection(addDateDays(selected, -7))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      className="rounded-lg border border-line p-2"
                      aria-label="Next week"
                      onClick={() => changeSelection(addDateDays(selected, 7))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                {Array.from({ length: 7 }, (_, i) => {
                  const key = addDateDays(week, i);
                  const total = dayTotal(key);
                  const manual = entries
                    .filter((e) => e.source === "manual")
                    .reduce(
                      (sum, e) =>
                        sum + secondsWithin(e, ...range(key)),
                      0,
                    );
                  const overtime = overtimeForDay(key);
                  const scale = Math.max(
                    8 * 3600,
                    ...Array.from({ length: 7 }, (_, j) =>
                      dayTotal(addDateDays(week, j)),
                    ),
                  );
                  return (
                    <button
                      key={key}
                      onClick={() => changeSelection(key)}
                      className={`grid w-full grid-cols-[95px_minmax(0,1fr)_66px] items-center gap-3 border-t border-line py-5 text-left text-sm sm:grid-cols-[120px_minmax(0,1fr)_76px] ${selected === key ? "font-semibold text-ink" : "text-zinc-500"}`}
                      aria-label={`View ${dateLabel(key)}, ${formatTime(total)} hours`}
                    >
                      <span>
                        {Number(key.slice(8))}{" "}
                        {dateLabel(key, { weekday: "long" })}
                      </span>
                      <span className="flex h-2.5 overflow-hidden rounded-sm bg-mist">
                        <span
                          className="bg-[#14a800]"
                          style={{
                            width: `${(Math.max(0, total - manual - overtime) / scale) * 100}%`,
                          }}
                        />
                        <span
                          className="bg-[#79bd6a]"
                          style={{
                            width: `${(Math.max(0, manual - Math.max(0, overtime - (total - manual))) / scale) * 100}%`,
                          }}
                        />
                        <span
                          className="bg-red-400"
                          style={{ width: `${(overtime / scale) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums">
                        {formatTime(total)} hrs
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  {dateLabel(selected, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <span className="text-sm text-zinc-500">
                  {formatTime(dayTotal(selected))} hrs
                </span>
              </div>
              {entries
                .filter(
                  (entry) =>
                    secondsWithin(entry, ...range(selected)) > 0,
                )
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {clock(entry.start, zone)} –{" "}
                        {entry.id === timer?.id && running
                          ? "Now"
                          : clock(entry.end, zone)}{" "}
                        <span className="ml-2 text-xs text-zinc-500">
                          {entry.id === timer?.id
                            ? running
                              ? "Tracking"
                              : "Pending confirmation"
                            : entry.source === "manual"
                              ? "▲ Manual"
                              : "● Tracked"}
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        {entry.project && (
                          <span className="inline-flex items-center gap-1.5">
                            <img
                              className="h-5 w-5 object-contain"
                              src={asset(
                                `icons/${projectIcons[entry.project]}`,
                              )}
                              alt=""
                            />
                            {projectName(entry.project)}
                          </span>
                        )}
                        {entry.issue && (
                          <a
                            className="inline-flex items-center gap-1 text-forest hover:underline"
                            href={entry.issue}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Github size={13} />
                            Issue #{entry.issue.match(/issues\/(\d+)/)?.[1]}
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                    <span className="tabular-nums">
                      {formatTime(
                        secondsWithin(entry, ...range(selected)),
                      )}{" "}
                      hrs
                    </span>
                  </div>
                ))}
              {upworkMode &&
                upwork.timeEntries
                  .filter((entry) => entry.date.slice(0, 10) === selected)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="mt-4 flex justify-between gap-4 border-t border-line pt-4 text-sm"
                    >
                      <div>
                        <p>{entry.contractTitle || "Upwork contract"}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {entry.memo || "Synced from Upwork"} · Daily total
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {formatTime(entry.hours * 3600)} hrs
                      </span>
                    </div>
                  ))}
              {!dayTotal(selected) && (
                <p className="py-8 text-center text-sm text-zinc-500">
                  {c.ready
                    ? "No time recorded for this day."
                    : "Loading your work diary…"}
                </p>
              )}
              {upworkMode && (
                <p className="mt-4 text-xs text-zinc-500">
                  {upwork.lastSyncedAt
                    ? `Last synced ${new Date(upwork.lastSyncedAt).toLocaleString("en-GB", { timeZone: zone })}. `
                    : ""}
                  Upwork provides daily totals; activity and manual-time details
                  are not available in this sync.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {modal && !upworkMode && (
        <TimeDialog
          key={modal}
          mode={modal}
          controller={c}
          projects={member.benefitPrograms}
          zone={zone}
          selected={selected}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function TimeDialog({
  mode,
  controller: c,
  projects,
  zone,
  selected,
  onClose,
}: {
  mode: "tracked" | "manual";
  controller: TimesheetController;
  projects: BenefitProgram[];
  zone: string;
  selected: string;
  onClose: () => void;
}) {
  const [id] = useState(() =>
    mode === "tracked" ? (c.data.timer?.id ?? "") : crypto.randomUUID(),
  );
  const [issue, setIssue] = useState("");
  const [noIssue, setNoIssue] = useState(false);
  const [project, setProject] = useState("");
  const [startDate, setStartDate] = useState(selected);
  const [endDate, setEndDate] = useState(selected);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [validation, setValidation] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  const start =
    mode === "tracked"
      ? Date.parse(c.data.timer?.start ?? "")
      : zonedInstant(startDate, from, zone);
  const end =
    mode === "tracked"
      ? Date.parse(c.data.timer?.end ?? "")
      : zonedInstant(endDate, to, zone);
  async function confirm() {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setValidation("Choose a valid period with an end after the start.");
      return;
    }
    if (!noIssue && !isIssueLink(issue.trim())) {
      setValidation(
        "Enter a GitHub issue URL or select “I don’t have this link”.",
      );
      return;
    }
    setValidation("");
    if (
      await c.execute({
        kind: mode === "tracked" ? "confirm" : "manual",
        id,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        issue,
        noIssue,
        project,
      })
    )
      onClose();
  }
  const field =
    "h-11 w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/10 disabled:bg-mist disabled:text-zinc-400";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="time-dialog-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-paper p-6 text-ink shadow-soft backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!c.busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="time-dialog-title" className="text-xl font-semibold">
            {mode === "tracked" ? "Confirm tracked time" : "Add tracked time"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded-lg p-2 hover:bg-mist"
            disabled={c.busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <fieldset disabled={c.busy} className="min-w-0">
          <div className="mt-5 rounded-lg bg-mist p-4">
            <p className="text-xs font-medium text-zinc-500">
              Active work period · {zone}
            </p>
            {mode === "tracked" ? (
              <p className="mt-2 text-sm font-semibold">
                {Number.isFinite(start)
                  ? `${dateLabel(dateKey(start, zone))}, ${clock(new Date(start).toISOString(), zone)}`
                  : "—"}{" "}
                –{" "}
                {Number.isFinite(end)
                  ? `${dateLabel(dateKey(end, zone))}, ${clock(new Date(end).toISOString(), zone)}`
                  : "—"}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs">
                  Start date
                  <input
                    className={field}
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  End date
                  <input
                    className={field}
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  From
                  <input
                    className={field}
                    type="time"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  To
                  <input
                    className={field}
                    type="time"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
            )}
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {formatTime(
                Number.isFinite(end - start) ? (end - start) / 1000 : 0,
              )}{" "}
              <span className="text-sm font-normal text-zinc-500">hrs</span>
            </p>
          </div>
          <label className="mt-5 grid gap-2 text-sm font-medium">
            GitHub issue link
            {!noIssue && <span className="sr-only"> (required)</span>}
            <input
              autoFocus
              className={field}
              type="url"
              disabled={noIssue}
              required={!noIssue}
              placeholder="https://github.com/owner/repo/issues/123"
              value={issue}
              onChange={(e) => {
                setIssue(e.target.value);
                setValidation("");
              }}
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
            <input
              className="h-4 w-4 accent-[#7F00FF]"
              type="checkbox"
              checked={noIssue}
              onChange={(e) => {
                setNoIssue(e.target.checked);
                setValidation("");
              }}
            />
            I don't have this link
          </label>
          <div className="mt-5">
            <p id="project-label" className="mb-2 text-sm font-medium">
              Project{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </p>
            <details ref={picker} className="relative">
              <summary
                aria-labelledby="project-label"
                className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-line px-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  {project && (
                    <img
                      className="h-6 w-6 object-contain"
                      src={asset(`icons/${projectIcons[project]}`)}
                      alt=""
                    />
                  )}
                  {project ? projectName(project) : "Select a project"}
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="mt-1 rounded-lg border border-line bg-paper p-1">
                {["", ...projects].map((value) => (
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-mist ${value === project ? "text-forest" : ""}`}
                    key={value}
                    onClick={() => {
                      setProject(value);
                      picker.current?.removeAttribute("open");
                    }}
                  >
                    {value && (
                      <img
                        className="h-6 w-6 object-contain"
                        src={asset(`icons/${projectIcons[value]}`)}
                        alt=""
                      />
                    )}
                    {value ? projectName(value) : "No project"}
                  </button>
                ))}
                {!projects.length && (
                  <p className="px-3 py-2 text-xs text-zinc-500">
                    No projects assigned.
                  </p>
                )}
              </div>
            </details>
          </div>
        </fieldset>
        {(validation || c.error) && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {validation || c.error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className={`${button} border border-line`}
            disabled={c.busy}
            onClick={onClose}
          >
            {mode === "tracked" ? "Finish later" : "Cancel"}
          </button>
          <button
            type="submit"
            className={`${button} bg-forest text-white`}
            disabled={c.busy}
          >
            {c.busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
