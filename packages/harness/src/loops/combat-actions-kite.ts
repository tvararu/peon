import {
  type CombatAura,
  type Entity,
  isUnit,
  type SpellDefinition,
} from "@peon/core";
import {
  goalBearingText,
  PILOT_RUN_SPEED_YD,
  type PilotPose,
  relativeDeg,
} from "#harness/loops/pilot-geometry";
import type { GoalText } from "#harness/loops/pilot-options";

export const MELEE_MIN_REACH_YD = 5;
export const MELEE_MOVING_LEEWAY_YD = 2.66;
export const BACKPEDAL_SPEED_YD = 4.5;
export const MOVE_HORIZON_S = 1;
const AURA_MOD_STUN = 12;
const AURA_MOD_ROOT = 26;
const AURA_MOD_DECREASE_SPEED = 33;
const CLOSING_WINDOW_MS = 2500;
const CLOSING_MIN_SPAN_MS = 400;
const CLOSING_MIN_GAP_MS = 100;
const CLOSING_STEADY_YD_PER_S = 0.5;
export function meleeReachYd(
  self: Entity | undefined,
  target: Entity | undefined,
): number | undefined {
  if (!(isUnit(self) && isUnit(target))) return undefined;
  const a = self.combatReach;
  const b = target.combatReach;
  if (a === undefined || b === undefined) return undefined;
  return Math.max(MELEE_MIN_REACH_YD, a + b + 4 / 3);
}

export class ClosingTracker {
  private samples: { at: number; yd: number }[] = [];
  private guid: bigint | undefined;

  reset(): void {
    this.samples = [];
    this.guid = undefined;
  }

  record(input: { at: number; guid: bigint; yd: number | undefined }): void {
    const { at, guid, yd } = input;
    if (guid !== this.guid) {
      this.samples = [];
      this.guid = guid;
    }
    if (yd === undefined) {
      this.samples = [];
      return;
    }
    const last = this.samples.at(-1);
    if (last && at - last.at < CLOSING_MIN_GAP_MS) return;
    this.samples.push({ at, yd });
    this.samples = this.samples.filter(
      (sample) => at - sample.at <= CLOSING_WINDOW_MS,
    );
  }

  speedYdPerS(): number | undefined {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (!(first && last) || last.at - first.at < CLOSING_MIN_SPAN_MS)
      return undefined;
    return ((first.yd - last.yd) / (last.at - first.at)) * 1000;
  }
}

function closingText(speed: number | undefined): string {
  if (speed === undefined) return "closing speed not observed yet";
  if (Math.abs(speed) < CLOSING_STEADY_YD_PER_S)
    return "holding its distance (observed)";
  const rounded = Math.round(Math.abs(speed) * 10) / 10;
  return speed > 0
    ? `closing at ${rounded} yd/s (observed)`
    : `falling back at ${rounded} yd/s (observed)`;
}

function tenths(value: number): number {
  return Math.round(value * 10) / 10;
}

export type ReachFact = {
  name: string;
  distanceYd: number;
  reachYd: number | undefined;
  closingYdPerS: number | undefined;
};

export function reachText(fact: ReachFact): string {
  const distance = tenths(fact.distanceYd);
  const closing = closingText(fact.closingYdPerS);
  if (fact.reachYd === undefined)
    return `${fact.name} is ${distance} yd away; its melee reach is not known; ${closing}`;
  const margin = tenths(fact.distanceYd - fact.reachYd);
  const moving = tenths(fact.reachYd + MELEE_MOVING_LEEWAY_YD);
  return `${fact.name} is ${distance} yd away, ${sideText(margin)} its melee reach (${tenths(fact.reachYd)} yd; ${moving} yd while you both move); ${closing}`;
}

export type ImpairKind = "rooted" | "slowed" | "stunned";

function impairKind(
  spell: SpellDefinition | undefined,
): ImpairKind | undefined {
  const auras = spell?.effects.map((effect) => effect.applyAura) ?? [];
  if (auras.includes(AURA_MOD_ROOT)) return "rooted";
  if (auras.includes(AURA_MOD_STUN)) return "stunned";
  if (auras.includes(AURA_MOD_DECREASE_SPEED)) return "slowed";
  return undefined;
}

export function impairments(
  auras: readonly CombatAura[],
  definition: (spellId: number) => SpellDefinition | undefined,
): string[] {
  return auras.flatMap((aura) => {
    const kind = impairKind(definition(aura.spellId));
    if (!kind) return [];
    const name = aura.name ?? `spell ${aura.spellId}`;
    const left =
      aura.timeLeft === undefined
        ? ""
        : `, ${Math.ceil(aura.timeLeft / 1000)} s left`;
    return [`${kind} by ${name}${left} (aura)`];
  });
}

export type MoveGoal = {
  pose: PilotPose;
  target: { x: number; y: number } | undefined;
  name: string;
  reachYd: number | undefined;
};

function stepYd(pose: PilotPose, moved: number): number {
  const backward = Math.abs(relativeDeg(moved, pose.orientation)) > 135;
  if (backward) return BACKPEDAL_SPEED_YD * MOVE_HORIZON_S;
  return (pose.speed > 0 ? pose.speed : PILOT_RUN_SPEED_YD) * MOVE_HORIZON_S;
}

function sideText(margin: number): string {
  return margin >= 0 ? `${margin} yd outside` : `${Math.abs(margin)} yd inside`;
}

export function moveGoalText({
  pose,
  target,
  name,
  reachYd,
}: MoveGoal): GoalText {
  return ({ facing, moved }) => {
    if (target === undefined) return `${name}'s position is not observed`;
    const step = moved === undefined ? 0 : stepYd(pose, moved);
    const heading = moved ?? 0;
    const x = pose.x + Math.cos(heading) * step;
    const y = pose.y + Math.sin(heading) * step;
    const distance = Math.hypot(target.x - x, target.y - y);
    const bearing = goalBearingText(
      relativeDeg(Math.atan2(target.y - y, target.x - x), facing),
    );
    const where = `${tenths(distance)} yd ${bearing}`;
    const lead =
      moved === undefined
        ? `${name} is ${where}`
        : `${name} would be ${where} after ${MOVE_HORIZON_S} s if it stood still`;
    if (reachYd === undefined) return lead;
    const reach =
      moved === undefined ? reachYd : reachYd + MELEE_MOVING_LEEWAY_YD;
    const margin = tenths(distance - reach);
    return `${lead}, ${sideText(margin)} its melee reach (${tenths(reach)} yd)`;
  };
}
