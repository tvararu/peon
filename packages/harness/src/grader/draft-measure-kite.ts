import type { Measured } from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";

const field = (row: GameLogRow | undefined, key: string): unknown =>
  row !== undefined && isRecord(row.data) ? row.data[key] : undefined;

const timeOf = (row: GameLogRow): number =>
  typeof row.ts === "number" && Number.isFinite(row.ts) ? row.ts : 0;

const sameTarget = (start: GameLogRow, row: GameLogRow): boolean =>
  row.guid === start.guid || field(row, "target") === field(start, "target");

export function kiteClean(rows: readonly GameLogRow[]): Measured {
  const startIndex = rows.findIndex((row) => row.event === "fight/start");
  const start = rows[startIndex];
  if (start === undefined)
    return { met: false, observed: { reason: "no fight" } };
  const end = rows
    .slice(startIndex + 1)
    .find((row) => row.event === "fight/end" && sameTarget(start, row));
  const until = end === undefined ? Number.POSITIVE_INFINITY : timeOf(end);
  const swings = rows.filter(
    (row) =>
      row.event === "combat/swung_at" &&
      timeOf(row) >= timeOf(start) &&
      timeOf(row) <= until,
  );
  const deaths = rows.filter((row) => row.event === "life/dead");
  const first = swings[0];
  const status = field(end, "outcome");
  return {
    line: first?.line ?? start.line,
    met:
      end !== undefined &&
      status === "completed" &&
      swings.length === 0 &&
      deaths.length === 0,
    observed: {
      deaths: deaths.length,
      firstSwing:
        first === undefined ? null : { line: first.line, text: first.text },
      outcome: end === undefined ? "no fight/end" : status,
      reason: field(end, "reason"),
      swings: swings.length,
      target: field(start, "name"),
    },
  };
}
