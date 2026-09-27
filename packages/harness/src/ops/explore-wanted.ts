import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { grayLevel } from "#harness/loops/combat-actions-credit";
import { selfView } from "#harness/ops/views";

type Wanted = (unit: UnitView) => boolean;

export function critter(unit: UnitView): boolean {
  return unit.kind === "creature" && unit.level <= 1 && unit.roles.length === 0;
}

function grayTo(level: number, unit: UnitView): boolean {
  return unit.kind === "creature" && unit.level <= grayLevel(level);
}

export function exploreWanted(ctx: ViewCtx, what: string | undefined): Wanted {
  const kind = (what ?? "").trim().toLowerCase();
  if (kind === "questgiver") return (unit) => unit.roles.includes("questgiver");
  if (kind === "vendor")
    return (unit) => unit.roles.some((role) => role.startsWith("vendor"));
  if (kind !== "" && kind !== "hostile")
    return (unit) => unit.name.toLowerCase().includes(kind);
  const { level } = selfView(ctx);
  return (unit) =>
    unit.attackable && unit.alive && !critter(unit) && !grayTo(level, unit);
}

export function passedUnits(
  ctx: ViewCtx,
  units: readonly UnitView[],
  wanted: Wanted,
): UnitView[] {
  const { level } = selfView(ctx);
  return units.filter(
    (unit) =>
      unit.attackable &&
      !wanted(unit) &&
      (critter(unit) || grayTo(level, unit)),
  );
}
