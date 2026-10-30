import { useCallback, useEffect, useRef, useState } from "react";
import { updateTimesheet } from "./storage";
import {
  emptyTimesheet,
  formatTime,
} from "../supabase/functions/_shared/timesheet";
import type {
  TimeCommand,
  Timesheet,
} from "../supabase/functions/_shared/timesheet";
import type { WorkspaceMember } from "./types";

function sessionToken() {
  try {
    return JSON.parse(
      localStorage.getItem("flat-reality-workspace-session") ?? "null",
    )?.token as string | undefined;
  } catch {
    return undefined;
  }
}
const asset = (file: string) =>
  `${import.meta.env.BASE_URL}resources/audio/${file}.wav`;
const sounds: Partial<Record<"start" | "confirm", HTMLAudioElement>> = {};
function prepareSounds() {
  for (const kind of ["start", "confirm"] as const) {
    if (!sounds[kind]) {
      sounds[kind] = new Audio(asset(`tracking-${kind}`));
      sounds[kind]!.load();
    }
  }
}
function playSound(kind: "start" | "confirm") {
  const sound = (sounds[kind] ??= new Audio(asset(`tracking-${kind}`)));
  sound.currentTime = 0;
  void sound.play().catch(() => {
    /* Browser sound preferences must not block saving. */
  });
}

export function useTimesheet(member: WorkspaceMember | null, enabled: boolean) {
  const [loaded, setLoaded] = useState<{
    memberId: string;
    data: Timesheet;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const owner = member?.id ?? "";
  const memberRef = useRef(member);
  memberRef.current = member;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const inFlight = useRef(false);
  const generation = useRef(0);
  const data = loaded?.memberId === owner ? loaded.data : emptyTimesheet();

  const refresh = useCallback(async () => {
    const actor = memberRef.current;
    if (!actor || !enabled || inFlight.current) return;
    const request = ++generation.current;
    try {
      const next = await updateTimesheet(
        actor,
        { kind: "snapshot" },
        sessionToken(),
      );
      if (request === generation.current && currentOwner.current === actor.id) {
        setLoaded({ memberId: actor.id, data: next });
        setError("");
      }
    } catch (e) {
      if (request === generation.current && currentOwner.current === actor.id)
        setError(
          e instanceof Error ? e.message : "Timesheet could not be loaded.",
        );
    }
  }, [enabled]);

  useEffect(() => {
    ++generation.current;
    setLoaded(null);
    setError("");
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const sync = () => void refresh();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      ++generation.current;
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, [owner, enabled, refresh]);
  const running = enabled && data.timer && !data.timer.end;
  useEffect(() => {
    if (!enabled) return;
    const tick = window.setInterval(
      () => setNow(Date.now()),
      running ? 1000 : 60000,
    );
    return () => window.clearInterval(tick);
  }, [enabled, running]);
  useEffect(() => {
    if (!running || !data.timer) return;
    const original = document.title;
    const update = () => {
      document.title = `● ${formatTime((Date.now() - Date.parse(data.timer!.start)) / 1000)} Tracking · Timesheet`;
    };
    update();
    const tick = window.setInterval(update, 1000);
    return () => {
      clearInterval(tick);
      document.title = original;
    };
  }, [running, data.timer?.start]);

  async function execute(command: TimeCommand) {
    const actor = memberRef.current;
    if (!actor || !enabled || inFlight.current) return false;
    inFlight.current = true;
    ++generation.current;
    setBusy(true);
    setError("");
    // Preload from the user gesture; actual playback follows successful persistence.
    prepareSounds();
    try {
      const next = await updateTimesheet(actor, command, sessionToken());
      if (currentOwner.current !== actor.id) return false;
      setLoaded({ memberId: actor.id, data: next });
      setNow(Date.now());
      if (command.kind === "start") playSound("start");
      if (command.kind === "confirm" || command.kind === "manual")
        playSound("confirm");
      return true;
    } catch (e) {
      if (currentOwner.current === actor.id)
        setError(
          e instanceof Error
            ? e.message
            : "Time could not be saved. Try again.",
        );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    data,
    now,
    busy,
    error,
    ready: loaded?.memberId === owner,
    execute,
    refresh,
  };
}
export type TimesheetController = ReturnType<typeof useTimesheet>;
