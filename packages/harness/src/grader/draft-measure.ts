import {
  answerTime,
  answerValues,
  killAfterAnswer,
  type MeasureContext,
  type Measured,
  noFightAfterStop,
  petAttack,
} from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";
import type { CheckMeasure } from "#harness/grader/scenarios";

const ROWS_MAX = 10;

const field = (row: GameLogRow, key: string): unknown =>
  isRecord(row.data) ? row.data[key] : undefined;

const numberOf = (value: unknown): number =>
  typeof value === "number" ? value : 0;

const timeOf = (row: GameLogRow): number => numberOf(row.ts);

function killXp(rows: readonly GameLogRow[]): Measured {
  const credited = new Set(
    rows
      .filter((row) => row.event === "combat/kill_credit")
      .map((row) => row.guid),
  );
  const gains = rows.filter((row) => row.event === "xp/gain");
  const fromKills = gains.filter((row) => credited.has(field(row, "victim")));
  const sum = (list: readonly GameLogRow[]) =>
    list.reduce((total, row) => total + numberOf(field(row, "amount")), 0);
  return {
    line: fromKills[0]?.line,
    observed: {
      kills: credited.size,
      killXp: sum(fromKills),
      otherXp: sum(gains) - sum(fromKills),
      rows: fromKills.slice(0, ROWS_MAX),
    },
  };
}

type Fight = { start: GameLogRow; until: number };

function fightsOf(rows: readonly GameLogRow[]): Fight[] {
  return rows.flatMap((start, index) => {
    if (start.event !== "fight/start") return [];
    const later = rows.slice(index + 1);
    const end = later.find(
      (row) =>
        (row.event === "fight/end" && row.guid === start.guid) ||
        row.event === "fight/start",
    );
    return [
      {
        start,
        until: end === undefined ? Number.POSITIVE_INFINITY : timeOf(end),
      },
    ];
  });
}

const attackersOf = (row: GameLogRow): number | undefined => {
  const attackers = field(row, "attackers");
  return Array.isArray(attackers) ? attackers.length : undefined;
};

function maxAttackers(rows: readonly GameLogRow[]): Measured {
  const fights = fightsOf(rows);
  if (fights.length === 0) return { observed: "no fight" };
  const worlds = rows.filter(
    (row) => row.event === "snapshot/world" && attackersOf(row) !== undefined,
  );
  const windows = fights.map(({ start, until }) => ({
    inside: worlds.filter(
      (row) => timeOf(row) >= timeOf(start) && timeOf(row) <= until,
    ),
    start,
  }));
  const counted = (inside: readonly GameLogRow[]) =>
    Math.max(0, ...inside.map((row) => attackersOf(row) ?? 0));
  const listed = windows.map(({ inside, start }) => ({
    line: start.line,
    maxAttackers: counted(inside),
    name: field(start, "name"),
    ref: start.ref,
  }));
  const most = Math.max(...listed.map((fight) => fight.maxAttackers));
  const peak = windows
    .flatMap(({ inside }) => inside)
    .find((row) => most > 0 && attackersOf(row) === most);
  return {
    line: peak?.line,
    observed: {
      fights: listed,
      maxAttackers: most,
    },
  };
}

const MEASURES: Record<
  CheckMeasure,
  (rows: readonly GameLogRow[], context: MeasureContext) => Measured
> = {
  answer_time: answerTime,
  answer_values: answerValues,
  kill_after_answer: killAfterAnswer,
  kill_xp: killXp,
  max_attackers: maxAttackers,
  no_fight_after_stop: noFightAfterStop,
  pet_attack: petAttack,
};

export function measureGameLog(
  rows: readonly GameLogRow[],
  measure: CheckMeasure,
  context: MeasureContext,
): Measured {
  return MEASURES[measure](rows, context);
}
