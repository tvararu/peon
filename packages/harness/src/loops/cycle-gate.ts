import type { CombatUnit } from "@peon/core";
import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";

export const MIN_HP_PCT = 50;
export const MIN_MANA_PCT = 30;
const MANA = 0;

export type PullVitals = {
  attackers: readonly bigint[];
  self: Pick<
    CombatUnit,
    "health" | "maxHealth" | "power" | "maxPower" | "powerType"
  >;
};
export type PullGate = (guid: bigint) => CycleStop | undefined;

function percent(
  value: number | undefined,
  max: number | undefined,
): number | undefined {
  return value === undefined || !max ? undefined : (value / max) * 100;
}

export function pullGate(vitals: () => PullVitals): PullGate {
  return (guid) => {
    const { attackers, self } = vitals();
    if (attackers.includes(guid)) return;
    const hp = percent(self.health, self.maxHealth);
    if (hp !== undefined && hp < MIN_HP_PCT)
      return cycleStop("low_health", { pct: Math.round(hp) });
    const mana =
      self.powerType === MANA ? percent(self.power, self.maxPower) : undefined;
    if (mana !== undefined && mana < MIN_MANA_PCT)
      return cycleStop("low_mana", { pct: Math.round(mana) });
  };
}
