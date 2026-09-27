import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { UnitView } from "#harness/contract/views";
import { ENGAGE_APPROACH_YD } from "#harness/ops/range";
import { guidHex } from "#harness/ops/refs";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  structuralAsk,
  structuralReach,
  type Unreached,
} from "#harness/ops/unreached";
import { unitViews } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import type { FightInit } from "#harness/tools/engage-choose";
import { afterOf, type Tally } from "#harness/tools/engage-tally";
import { askHuman, nextCall } from "#harness/tools/next-call";

type Report = ToolResult<EngageAfter>;
export type Walk = { ms: number; yd: number };
export type Scene = FightInit & {
  tally: Tally;
  how: string;
  walk: Walk | undefined;
};

const APPROACH_WITHIN_YD = 25;

export function otherInView(scene: Scene): UnitView | undefined {
  const { choice, ops, tally } = scene;
  const fought = new Set(tally.targets.map((target) => target.ref));
  return unitViews(ops).find(
    (unit) =>
      unit.alive &&
      !unit.tappedByOther &&
      unit.name === choice.unit?.name &&
      unit.ref !== choice.unit?.ref &&
      !fought.has(unit.ref),
  );
}

function unreachedNext(scene: Scene, leg: Unreached): string {
  if (leg.reason === "start_off_mesh")
    return nextCall("travel", { to: "unstick" });
  const kind = structuralReach(leg);
  const name = scene.choice.unit?.name ?? "the target";
  if (kind === "unsupported_map") return structuralAsk(kind, name);
  const other = otherInView(scene);
  if (other) return nextCall("engage", { target: other.ref });
  return askHuman(`I cannot reach ${name} from here. Is there another way?`);
}

export async function approach(scene: Scene): Promise<Report | undefined> {
  const { choice, ops } = scene;
  if (
    !choice.unit ||
    choice.guid === undefined ||
    (choice.unit.distance ?? 0) <= ENGAGE_APPROACH_YD
  )
    return;
  const startedAt = ops.rt.clock.now();
  const leg = await travelLeg(ops, {
    goal: { guid: choice.guid, kind: "unit", name: choice.unit.name },
    within: APPROACH_WITHIN_YD,
  });
  scene.walk = { ms: ops.rt.clock.now() - startedAt, yd: leg.traveledYd };
  if (leg.status === "arrived") return;
  const reason = leg.reason ?? leg.status;
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `could not reach ${choice.unit.name} ${choice.unit.ref}: ${leg.detail}.`,
    next: unreachedNext(scene, { detail: leg.detail, reason }),
    reason,
  });
}

export function unobserved(scene: Scene): Report | undefined {
  const { choice, ops } = scene;
  if (choice.mode === "quest" || !choice.unit || choice.guid === undefined)
    return;
  const hex = guidHex(choice.guid);
  if (unitViews(ops).some((unit) => unit.guid === hex && unit.alive)) return;
  const other = otherInView(scene);
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `${choice.unit.name} ${choice.unit.ref} is not in view any more; the fight did not start.`,
    next: other
      ? nextCall("engage", { target: other.ref })
      : nextCall("travel", { to: "explore" }),
    reason: "target_not_observed",
  });
}
