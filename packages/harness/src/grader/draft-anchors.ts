import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { isRecord } from "#harness/grader/exec";

const ROWS_MAX = 10;
const HEX_PREFIX = /^0x/;

export type Measured = { observed: unknown; line?: number; met?: boolean };

export type MeasureContext = { jev: unknown[] | null; steers: string[] };

const field = (row: GameLogRow, key: string): unknown =>
  isRecord(row.data) ? row.data[key] : undefined;

const bareGuid = (value: unknown): string | undefined =>
  typeof value === "string" ? value.replace(HEX_PREFIX, "") : undefined;

const petOf = (entry: unknown): unknown =>
  isRecord(entry) && isRecord(entry["observation"])
    ? entry["observation"]["pet"]
    : undefined;

function jevOnTarget(jev: unknown[] | null, targets: Set<string>) {
  if (jev === null) return null;
  return jev.filter((entry) => {
    const pet = petOf(entry);
    return (
      isRecord(pet) &&
      pet["onTarget"] === true &&
      targets.has(bareGuid(pet["target"]) ?? "")
    );
  }).length;
}

export function petAttack(
  rows: readonly GameLogRow[],
  { jev }: MeasureContext,
): Measured {
  const killTargets = [
    ...new Set(
      rows
        .filter((row) => row.event === "combat/kill_credit")
        .flatMap((row) => bareGuid(row.guid) ?? []),
    ),
  ];
  const targets = new Set(killTargets);
  const petAttacks = rows.filter(
    (row) =>
      row.event === "combat/pet_attack" &&
      targets.has(bareGuid(field(row, "target")) ?? ""),
  );
  const onTarget = jevOnTarget(jev, targets);
  return {
    line: petAttacks[0]?.line,
    met: petAttacks.length > 0 && (onTarget ?? 0) > 0,
    observed: {
      jevOnTarget: onTarget,
      killTargets,
      petAttacks: petAttacks.slice(0, ROWS_MAX),
    },
  };
}
