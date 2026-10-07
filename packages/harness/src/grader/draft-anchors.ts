import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";

export type Measured = { observed: unknown; line?: number; met?: boolean };

export type MeasureContext = {
  creature?: { name: string; entry: number };
  jev: unknown[] | null;
  packets: unknown[] | null;
  steers: string[];
};

const field = (row: GameLogRow, key: string): unknown =>
  isRecord(row.data) ? row.data[key] : undefined;

const STOP_WINDOW_MS = 10_000;
const ANSWER_MS = 60_000;
const JEV_MS = 2000;

const timeOf = (row: GameLogRow): number =>
  typeof row.ts === "number" ? row.ts : 0;

const brief = (row: GameLogRow | undefined) =>
  row === undefined ? null : { line: row.line, text: row.text, ts: row.ts };

function steerRow(
  rows: readonly GameLogRow[],
  text: string | undefined,
): GameLogRow | undefined {
  if (text === undefined) return undefined;
  return rows.find(
    (row) => row.event === "human/input" && field(row, "text") === text,
  );
}

const firstAfter = (
  rows: readonly GameLogRow[],
  event: string,
  after: GameLogRow | undefined,
): GameLogRow | undefined =>
  after === undefined
    ? undefined
    : rows.find((row) => row.event === event && row.line > after.line);

function question(rows: readonly GameLogRow[], { steers }: MeasureContext) {
  const steer = steerRow(rows, steers[0]);
  return { answer: firstAfter(rows, "agent/message", steer), steer };
}

export function killAfterAnswer(
  rows: readonly GameLogRow[],
  context: MeasureContext,
): Measured {
  const { answer, steer } = question(rows, context);
  const kill = firstAfter(rows, "combat/kill_credit", answer);
  return {
    line: kill?.line,
    met: kill !== undefined,
    observed: {
      answer: brief(answer),
      kill: kill === undefined ? null : { ...brief(kill), guid: kill.guid },
      steer: brief(steer),
    },
  };
}

export function noFightAfterStop(
  rows: readonly GameLogRow[],
  { steers }: MeasureContext,
): Measured {
  const steer = steerRow(rows, steers.at(-1));
  const fights =
    steer === undefined
      ? []
      : rows.filter(
          (row) => row.event === "fight/start" && row.line > steer.line,
        );
  const first = fights[0];
  const within10s = fights
    .filter((row) => steer && timeOf(row) - timeOf(steer) <= STOP_WINDOW_MS)
    .map(brief);
  return {
    line: first?.line,
    met: steer !== undefined && within10s.length === 0,
    observed: {
      firstFightAfterSec:
        first === undefined || steer === undefined
          ? null
          : (timeOf(first) - timeOf(steer)) / 1000,
      steer: brief(steer),
      within10s,
    },
  };
}

export function answerTime(
  rows: readonly GameLogRow[],
  context: MeasureContext,
): Measured {
  const { answer, steer } = question(rows, context);
  const ms =
    answer === undefined || steer === undefined
      ? undefined
      : timeOf(answer) - timeOf(steer);
  return {
    line: answer?.line,
    met: ms !== undefined && ms <= ANSWER_MS,
    observed: {
      answer: brief(answer),
      seconds: ms === undefined ? null : ms / 1000,
      steer: brief(steer),
    },
  };
}

function jevSelfAt(jev: unknown[] | null, at: number) {
  const rows = (jev ?? []).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry["ts"] !== "number") return [];
    const observation = entry["observation"];
    const self = isRecord(observation) ? observation["self"] : undefined;
    return self === undefined ? [] : [{ self, ts: entry["ts"] }];
  });
  const last = rows.findLast((row) => row.ts <= at);
  return last !== undefined && at - last.ts <= JEV_MS ? last : null;
}

export function answerValues(
  rows: readonly GameLogRow[],
  context: MeasureContext,
): Measured {
  const { answer, steer } = question(rows, context);
  const world =
    answer === undefined
      ? undefined
      : rows.findLast(
          (row) =>
            row.event === "snapshot/world" &&
            row.line < answer.line &&
            isRecord(field(row, "self")),
        );
  return {
    line: answer?.line,
    observed: {
      answer: brief(answer),
      jev: answer === undefined ? null : jevSelfAt(context.jev, timeOf(answer)),
      steer: brief(steer),
      world:
        world === undefined
          ? null
          : { ...brief(world), self: field(world, "self") },
    },
  };
}
