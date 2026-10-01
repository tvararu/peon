import { isUnit, UnitFlag } from "@peon/core";
import type { RepeatScene, ViewCtx } from "#harness/contract/services";
import { guidHex } from "#harness/ops/refs";
import { resolveUnit } from "#harness/ops/resolve";

const TARGET_KEYS = ["target", "npc", "to"] as const;

export function targetText(args: unknown): string | undefined {
  if (!(args && typeof args === "object")) return;
  const record = args as Record<string, unknown>;
  const value = TARGET_KEYS.map((key) => record[key]).find(
    (item) => typeof item === "string",
  );
  return typeof value === "string" ? value : undefined;
}

export function repeatScene(ctx: ViewCtx, args: unknown): RepeatScene {
  const { attackers } = ctx.handle.getCombatState();
  const self = ctx.handle.getEntity(ctx.handle.getControlState().selfGuid);
  const flagged =
    isUnit(self) &&
    self.unitFlags % (UnitFlag.IN_COMBAT * 2) >= UnitFlag.IN_COMBAT;
  const text = targetText(args);
  const found = text === undefined ? undefined : resolveUnit(ctx, { text });
  const unit = found?.kind === "unit" ? found : undefined;
  return {
    combat: flagged
      ? `self,${attackers.map(guidHex).sort().join(",")}`
      : attackers.map(guidHex).sort().join(","),
    targetAttacking: unit !== undefined && attackers.includes(unit.guid),
    targetYd: unit?.unit.distance,
  };
}
