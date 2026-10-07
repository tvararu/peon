import type { MeasureContext, Measured } from "#harness/grader/draft-anchors";
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

const MOVE_STARTS = [
  "MSG_MOVE_START_FORWARD",
  "MSG_MOVE_START_BACKWARD",
  "MSG_MOVE_START_STRAFE_LEFT",
  "MSG_MOVE_START_STRAFE_RIGHT",
  "MSG_MOVE_START_SWIM",
];

type FightMoves = { away: number; total: number };

function kiteMoves(
  packets: unknown[] | null,
  jev: unknown[] | null,
  from: number,
  until: number,
): FightMoves | undefined {
  if (packets === null || jev === null) return undefined;
  const moves = packets.flatMap((entry) => {
    if (!isRecord(entry) || entry["dir"] !== "out") return [];
    const at = entry["at"];
    if (typeof at !== "number" || !Number.isFinite(at)) return [];
    if (at < from || at > until) return [];
    return typeof entry["opcode"] === "string" &&
      MOVE_STARTS.includes(entry["opcode"])
      ? [at]
      : [];
  });
  const requests = (jev ?? []).flatMap((entry) => {
    if (!isRecord(entry) || entry["type"] !== "request") return [];
    const ts = entry["ts"];
    const observation = entry["observation"];
    const separation = isRecord(observation)
      ? observation["separation"]
      : undefined;
    if (
      typeof ts !== "number" ||
      !Number.isFinite(ts) ||
      typeof separation !== "number" ||
      !Number.isFinite(separation)
    )
      return [];
    return ts >= from && ts <= until ? [{ separation, ts }] : [];
  });
  const away = moves.filter((at) => {
    const before = requests.filter((request) => request.ts <= at).at(-1);
    const after = requests.find((request) => request.ts > at);
    return (
      before !== undefined &&
      after !== undefined &&
      after.separation > before.separation
    );
  }).length;
  return { away, total: moves.length };
}

type FightKill = { kill: GameLogRow; from: number; until: number };

function kiteKill(
  rows: readonly GameLogRow[],
  engage: GameLogRow,
): FightKill | undefined {
  const args = field(engage, "args");
  const wanted = isRecord(args) ? args["target"] : undefined;
  const targetName =
    typeof wanted === "string" && !wanted.startsWith("u") ? wanted : undefined;
  const kill = rows.find(
    (row, index) =>
      row.event === "combat/kill_credit" &&
      index > rows.indexOf(engage) &&
      (targetName === undefined ||
        (typeof field(row, "name") === "string" &&
          (field(row, "name") as string).toLowerCase() ===
            targetName.toLowerCase())),
  );
  if (kill === undefined) return undefined;
  return { from: timeOf(engage), kill, until: timeOf(kill) };
}

function kiteSwings(
  rows: readonly GameLogRow[],
  from: number,
  until: number,
): number {
  return rows.filter(
    (row) =>
      row.event === "combatlog/swing_in" &&
      timeOf(row) >= from &&
      timeOf(row) <= until,
  ).length;
}

function kiteHealth(
  rows: readonly GameLogRow[],
  from: number,
  until: number,
): number | null {
  const worlds = rows.filter(
    (row) =>
      row.event === "snapshot/world" &&
      timeOf(row) >= from &&
      timeOf(row) <= until &&
      isRecord(field(row, "self")),
  );
  const self = field(worlds.at(-1), "self");
  const hp = isRecord(self) ? self["hp"] : undefined;
  const maxHp = isRecord(self) ? self["maxHp"] : undefined;
  return typeof hp === "number" &&
    typeof maxHp === "number" &&
    Number.isFinite(hp) &&
    Number.isFinite(maxHp) &&
    maxHp > 0
    ? Math.round((hp / maxHp) * 100)
    : null;
}

export function pilotKite(
  rows: readonly GameLogRow[],
  { jev, packets }: MeasureContext,
): Measured {
  const engage = rows.find(
    (row) => row.event === "run/started" && field(row, "kind") === "engage",
  );
  const fight = engage === undefined ? undefined : kiteKill(rows, engage);
  if (engage === undefined || fight === undefined)
    return {
      line: engage?.line,
      met: false,
      observed: {
        reason:
          engage === undefined
            ? "no engage run/started"
            : "no combat/kill_credit after engage",
      },
    };
  const { from, kill, until } = fight;
  const swings = kiteSwings(rows, from, until);
  const dead = rows.find(
    (row) => row.event === "life/dead" && timeOf(row) >= until,
  );
  const moves = kiteMoves(packets, jev, from, until);
  return {
    line: kill.line,
    met: swings === 0 && dead === undefined,
    observed: {
      dead: dead === undefined ? null : { line: dead.line, text: dead.text },
      endHealthPct: kiteHealth(rows, from, until),
      kill: { guid: kill.guid, line: kill.line, name: field(kill, "name") },
      movesAway: moves?.away ?? null,
      movesTotal: moves?.total ?? null,
      reason:
        moves === undefined ? "packets.jsonl or jev.jsonl is missing" : null,
      swings,
    },
  };
}
