import type { AreaState } from "@peon/core";
import type { UnitView } from "#harness/contract/views";

type Motion = AreaState<"unitmotion">;
type Movement = NonNullable<UnitView["movement"]>;

const ROOT = 0x00_00_08_00;
const DISABLE_GRAVITY = 0x00_00_04_00;
const SWIMMING = 0x00_20_00_00;
const CAN_FLY = 0x01_00_00_00;
const HOVER = 0x40_00_00_00;

function hasAny(flags: number, bits: readonly number[]): boolean {
  return bits.some((bit) => Math.floor(flags / bit) % 2 === 1);
}

function slowedPct(unit: Motion["units"][number]): number | undefined {
  const run = unit.speeds.run?.value;
  const { runBefore } = unit;
  if (run === undefined || runBefore === undefined || runBefore <= 0)
    return undefined;
  return run < runBefore ? Math.round((run / runBefore) * 100) : undefined;
}

function movementOf(unit: Motion["units"][number]): Movement | undefined {
  const movement: Movement = {
    flying: hasAny(unit.flags, [CAN_FLY, DISABLE_GRAVITY]),
    hover: hasAny(unit.flags, [HOVER]),
    rooted: hasAny(unit.flags, [ROOT]),
    slowedPct: slowedPct(unit),
    swimming: hasAny(unit.flags, [SWIMMING]),
  };
  const set =
    movement.flying ||
    movement.hover ||
    movement.rooted ||
    movement.slowedPct !== undefined ||
    movement.swimming;
  return set ? movement : undefined;
}

export function movementWords(movement: UnitView["movement"]): string[] {
  if (!movement) return [];
  return [
    movement.rooted ? "rooted" : undefined,
    movement.slowedPct === undefined
      ? undefined
      : `slowed ${movement.slowedPct}%`,
    movement.swimming ? "swimming" : undefined,
  ].filter((word) => word !== undefined);
}

export function withMovement(
  rows: readonly UnitView[],
  state: Motion,
): UnitView[] {
  const units = new Map(state.units.map((unit) => [unit.guid, unit]));
  return rows.map((row) => {
    const unit = units.get(BigInt(`0x${row.guid}`));
    const movement = unit && movementOf(unit);
    return movement ? { ...row, movement } : row;
  });
}
