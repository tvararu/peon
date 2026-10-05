import type { Measured } from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { pilotRun } from "#harness/grader/draft-measure-pilot";
import { isRecord } from "#harness/grader/exec";

const OFFENDING_EVENTS: Record<string, true> = {
  "combat/attacked": true,
  "control/server_correction": true,
  "threat/aggro_switch": true,
  "threat/engaged": true,
};

const field = (row: GameLogRow | undefined, key: string): unknown =>
  row !== undefined && isRecord(row.data) ? row.data[key] : undefined;

const timeOf = (row: GameLogRow): number =>
  typeof row.ts === "number" && Number.isFinite(row.ts) ? row.ts : 0;

type Window = {
  line: number | undefined;
  from: number;
  until: number;
  completed: boolean;
  status: unknown;
  reason: unknown;
};

function pilotWindow(rows: readonly GameLogRow[]): Window | undefined {
  const run = pilotRun(rows);
  const first = rows.find((row) => row.event === "pilot/started");
  if (run === undefined || first === undefined) return undefined;
  return {
    completed: field(run.ended, "status") === "completed",
    from: Math.min(timeOf(first), run.from),
    line: first.line,
    reason:
      run.ended === undefined ? "no pilot/ended" : field(run.ended, "reason"),
    status: field(run.ended, "status"),
    until: run.until,
  };
}

function travelWindow(rows: readonly GameLogRow[]): Window | undefined {
  const startIndex = rows.findLastIndex(
    (row) => row.event === "run/started" && field(row, "kind") === "travel",
  );
  const started = startIndex < 0 ? undefined : rows[startIndex];
  if (started === undefined) return undefined;
  const id = field(started, "id");
  const ended = rows
    .slice(startIndex + 1)
    .find(
      (row) =>
        (row.event === "run/ended" || row.event === "run/cancelled") &&
        field(row, "id") === id,
    );
  const succeeded =
    ended?.event === "run/ended" && field(ended, "status") === "succeeded";
  const first = rows.find(
    (row) => row.event === "run/started" && field(row, "kind") === "travel",
  );
  return {
    completed: succeeded,
    from: timeOf(first ?? started),
    line: (first ?? started).line,
    reason: ended === undefined ? "no run/ended" : field(ended, "reason"),
    status: field(ended, "status"),
    until: ended === undefined ? Number.POSITIVE_INFINITY : timeOf(ended),
  };
}

const listsAttackers = (row: GameLogRow): boolean => {
  const attackers = field(row, "attackers");
  return Array.isArray(attackers) && attackers.length > 0;
};

const offends = (row: GameLogRow): boolean =>
  OFFENDING_EVENTS[row.event] === true ||
  (row.event === "snapshot/world" && listsAttackers(row));

function noAggro(
  rows: readonly GameLogRow[],
  window: Window | undefined,
  none: string,
): Measured {
  if (window === undefined) return { met: false, observed: { reason: none } };
  const inside = rows.filter(
    (row) => timeOf(row) >= window.from && timeOf(row) <= window.until,
  );
  const count = (event: string) =>
    inside.filter((row) => row.event === event).length;
  const first = inside.find(offends);
  return {
    line: first?.line ?? window.line,
    met: window.completed && first === undefined,
    observed: {
      attacked: count("combat/attacked"),
      corrections: count("control/server_correction"),
      firstOffending:
        first === undefined
          ? null
          : { event: first.event, line: first.line, text: first.text },
      reason: window.reason,
      snapshotsWithAttackers: inside.filter(
        (row) => row.event === "snapshot/world" && listsAttackers(row),
      ).length,
      status: window.status,
      threats: count("threat/engaged") + count("threat/aggro_switch"),
    },
  };
}

export function pilotNoAggro(rows: readonly GameLogRow[]): Measured {
  return noAggro(rows, pilotWindow(rows), "no pilot/started");
}

export function travelNoAggro(rows: readonly GameLogRow[]): Measured {
  return noAggro(rows, travelWindow(rows), "no travel run/started");
}
