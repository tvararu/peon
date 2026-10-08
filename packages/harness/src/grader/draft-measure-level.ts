import type { MeasureContext, Measured } from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";

export const HOUR_MS = 3_600_000;
export const STALL_MS = 300_000;

const field = (row: GameLogRow, key: string): unknown =>
  isRecord(row.data) ? row.data[key] : undefined;

const timeOf = (row: GameLogRow): number =>
  typeof row.ts === "number" ? row.ts : 0;

const numberOf = (value: unknown): number =>
  typeof value === "number" ? value : 0;

const minutesOf = (ms: number): number => Math.round(ms / 6000) / 10;

type Gap = { fromMs: number; ms: number };

function gapsOf(points: readonly number[]): Gap[] {
  return points.slice(1).map((ts, index) => {
    const from = points[index] ?? ts;
    return { fromMs: from - (points[0] ?? from), ms: ts - from };
  });
}

export function levelPace(
  rows: readonly GameLogRow[],
  { task }: MeasureContext,
): Measured {
  const start = rows.find(
    (row) => row.event === "human/input" && field(row, "text") === task,
  );
  if (start === undefined) return { observed: { start: null } };
  const after = rows.filter((row) => row.line >= start.line);
  const startMs = timeOf(start);
  const gains = after.filter((row) => row.event === "xp/gain");
  const ups = after.filter((row) => row.event === "xp/level_up");
  const amounts = gains.map((row) => numberOf(field(row, "amount")));
  const levels = ups
    .map((row) => ({
      level: numberOf(field(row, "level")),
      seconds: (timeOf(row) - startMs) / 1000,
    }))
    .sort((a, b) => a.level - b.level);
  const ten = ups.find((row) => numberOf(field(row, "level")) === 10);
  const last = after.at(-1);
  const gaps = gapsOf([
    startMs,
    ...gains.map(timeOf),
    ...(last ? [timeOf(last)] : []),
  ]);
  const longest = gaps.reduce((max, gap) => Math.max(max, gap.ms), 0);
  return {
    line: (ten ?? start).line,
    observed: {
      deaths: after.filter((row) => row.event === "life/dead").length,
      finalLevel:
        levels.length === 0
          ? null
          : Math.max(...levels.map(({ level }) => level)),
      levels,
      longestGapMinutes: minutesOf(longest),
      stalls: gaps
        .filter(({ ms }) => ms >= STALL_MS)
        .map(({ fromMs, ms }) => ({
          fromMinute: minutesOf(fromMs),
          minutes: minutesOf(ms),
        })),
      start: startMs,
      xp: amounts.reduce((total, amount) => total + amount, 0),
      xpFirstHour: gains
        .filter((row) => timeOf(row) - startMs <= HOUR_MS)
        .map((row) => numberOf(field(row, "amount")))
        .reduce((total, amount) => total + amount, 0),
    },
  };
}
