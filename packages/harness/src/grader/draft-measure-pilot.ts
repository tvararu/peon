import type { MeasureContext, Measured } from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";

const RING_TOLERANCE_YD = 5;
const MOVEMENT_TOOLS = ["travel", "engage", "recover"];

const field = (row: GameLogRow | undefined, key: string): unknown =>
  row !== undefined && isRecord(row.data) ? row.data[key] : undefined;

const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const timeOf = (row: GameLogRow): number => numberOf(row.ts) ?? 0;

type PilotRun = {
  started: GameLogRow;
  decisions: GameLogRow[];
  ended: GameLogRow | undefined;
  corrections: GameLogRow[];
  from: number;
  until: number;
};

function pilotRun(rows: readonly GameLogRow[]): PilotRun | undefined {
  const runs = rows.flatMap((row, index) =>
    row.event === "pilot/started" ? [runAt(rows, row, index)] : [],
  );
  return runs.findLast((run) => run.decisions.length > 0) ?? runs.at(-1);
}

function runAt(
  rows: readonly GameLogRow[],
  started: GameLogRow,
  startIndex: number,
): PilotRun {
  const runId = field(started, "runId");
  const later = rows.slice(startIndex + 1);
  const ended = later.find(
    (row) => row.event === "pilot/ended" && field(row, "runId") === runId,
  );
  const span =
    ended === undefined ? later : later.slice(0, later.indexOf(ended));
  return {
    corrections: span.filter(
      (row) => row.event === "control/server_correction",
    ),
    decisions: span.filter(
      (row) => row.event === "pilot/decision" && field(row, "runId") === runId,
    ),
    ended,
    from: timeOf(started),
    started,
    until: ended === undefined ? Number.POSITIVE_INFINITY : timeOf(ended),
  };
}

const statusOf = (run: PilotRun): unknown => field(run.ended, "status");

const reasonOf = (run: PilotRun): unknown =>
  run.ended === undefined ? "no pilot/ended" : field(run.ended, "reason");

const objectiveOf = (run: PilotRun): Record<string, unknown> => {
  const objective = field(run.started, "objective");
  return isRecord(objective) ? objective : {};
};

function distanceFrom(
  row: GameLogRow,
  x: number | undefined,
  y: number | undefined,
): number | undefined {
  const rx = numberOf(field(row, "x"));
  const ry = numberOf(field(row, "y"));
  if (x === undefined || y === undefined) return undefined;
  if (rx === undefined || ry === undefined) return undefined;
  return Math.hypot(rx - x, ry - y);
}

const NO_RUN: Measured = {
  met: false,
  observed: { reason: "no pilot/started" },
};

export function pilotCircle(rows: readonly GameLogRow[]): Measured {
  const run = pilotRun(rows);
  if (run === undefined) return NO_RUN;
  const objective = objectiveOf(run);
  const radius = numberOf(objective["radius"]);
  const distances = run.decisions.map((row) =>
    distanceFrom(row, numberOf(objective["x"]), numberOf(objective["y"])),
  );
  const known = distances.filter((value) => value !== undefined);
  const min = known.length === 0 ? undefined : Math.min(...known);
  const max = known.length === 0 ? undefined : Math.max(...known);
  const onRing =
    radius !== undefined &&
    known.length === distances.length &&
    known.every((value) => Math.abs(value - radius) <= RING_TOLERANCE_YD);
  return {
    line: run.started.line,
    met: statusOf(run) === "completed" && run.decisions.length > 0 && onRing,
    observed: {
      decisions: run.decisions.length,
      direction: objective["direction"],
      max,
      min,
      radius,
      reason: reasonOf(run),
      status: statusOf(run),
      walkedYd: field(run.ended, "walkedYd"),
    },
  };
}

export function pilotReach(rows: readonly GameLogRow[]): Measured {
  const run = pilotRun(rows);
  if (run === undefined) return NO_RUN;
  const objective = objectiveOf(run);
  const last = run.decisions.at(-1);
  const finalDistance =
    last === undefined
      ? undefined
      : distanceFrom(last, numberOf(objective["x"]), numberOf(objective["y"]));
  return {
    line: run.started.line,
    met: statusOf(run) === "completed" && run.corrections.length === 0,
    observed: {
      corrections: run.corrections.length,
      decisions: run.decisions.length,
      finalDistance,
      reason: reasonOf(run),
      status: statusOf(run),
    },
  };
}

type Mark = { at: number; opcode: string };

const LANDING_GRACE_MS = 1500;

function packetMarks(packets: unknown[], run: PilotRun): Mark[] {
  return packets.flatMap((entry) => {
    if (!isRecord(entry) || entry["dir"] !== "out") return [];
    const at = numberOf(entry["at"]);
    const opcode = entry["opcode"];
    if (at === undefined || at < run.from) return [];
    if (opcode === "MSG_MOVE_JUMP" && at <= run.until) return [{ at, opcode }];
    if (opcode === "MSG_MOVE_FALL_LAND" && at <= run.until + LANDING_GRACE_MS)
      return [{ at, opcode }];
    return [];
  });
}

function appliedJumps(jev: unknown[], run: PilotRun): number[] {
  return jev
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const ts = numberOf(entry["ts"]);
      const applied =
        entry["type"] === "applied" &&
        entry["loop"] === "pilot" &&
        entry["actionId"] === "jump_ahead";
      return applied && ts !== undefined && ts >= run.from ? [ts] : [];
    })
    .sort((a, b) => a - b);
}

type Mismatch = { jump: number; at: number; reason: string };

function firstMismatch(marks: Mark[], applied: number[]): Mismatch | undefined {
  const free = [...applied];
  let jump = 0;
  for (const [index, mark] of marks.entries()) {
    if (mark.opcode !== "MSG_MOVE_JUMP") continue;
    jump += 1;
    const matched = free.findLastIndex(
      (ts) => ts >= mark.at - 1500 && ts <= mark.at + 100,
    );
    if (matched < 0)
      return { at: mark.at, jump, reason: "no applied jump_ahead near it" };
    free.splice(matched, 1);
    const next = marks.findIndex(
      (later, laterIndex) =>
        laterIndex > index && later.opcode === "MSG_MOVE_JUMP",
    );
    const span = marks.slice(index + 1, next < 0 ? undefined : next);
    if (!span.some((later) => later.opcode === "MSG_MOVE_FALL_LAND"))
      return { at: mark.at, jump, reason: "no MSG_MOVE_FALL_LAND after it" };
  }
  return undefined;
}

export function pilotJumps(
  rows: readonly GameLogRow[],
  { jev, packets }: MeasureContext,
): Measured {
  const run = pilotRun(rows);
  if (run === undefined) return NO_RUN;
  if (packets === null || jev === null)
    return {
      met: false,
      observed: { reason: "packets.jsonl or jev.jsonl is missing" },
    };
  const marks = packetMarks(packets, run);
  const applied = appliedJumps(jev, run);
  const jumps = marks.filter((mark) => mark.opcode === "MSG_MOVE_JUMP").length;
  const mismatch = firstMismatch(marks, applied);
  return {
    line: run.started.line,
    met:
      statusOf(run) === "completed" &&
      jumps > 0 &&
      mismatch === undefined &&
      run.corrections.length === 0,
    observed: {
      appliedJumps: applied.length,
      corrections: run.corrections.length,
      firstMismatch: mismatch,
      jumps,
      landings: marks.length - jumps,
      reason: reasonOf(run),
      status: statusOf(run),
    },
  };
}

export function pilotOnlyMoves(
  _rows: readonly GameLogRow[],
  { tools }: MeasureContext,
): Measured {
  if (tools === null)
    return { met: false, observed: { reason: "tools.json is missing" } };
  const called = Object.entries(tools).flatMap(([name, row]) =>
    isRecord(row) && (numberOf(row["calls"]) ?? 0) > 0 ? [name] : [],
  );
  const others = called.filter((name) => MOVEMENT_TOOLS.includes(name));
  return {
    met: called.includes("pilot") && others.length === 0,
    observed: { movementTools: others, pilotCalled: called.includes("pilot") },
  };
}
