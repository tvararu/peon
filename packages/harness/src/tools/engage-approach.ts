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
import { selfView, unitViews } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { type FightInit, LEVEL_CAP_ABOVE } from "#harness/tools/engage-choose";
import { afterOf, type Tally } from "#harness/tools/engage-tally";
import { nextCall } from "#harness/tools/next-call";

type Report = ToolResult<EngageAfter>;
export type Walk = { ms: number; yd: number };
export type Scene = FightInit & {
  tally: Tally;
  how: string;
  walk: Walk | undefined;
  broken?: true;
};

const APPROACH_WITHIN_YD = 25;

export function otherInView(scene: Scene): UnitView | undefined {
  const { choice, ops, tally } = scene;
  const fought = new Set(tally.targets.map((target) => target.ref));
  return unitViews(ops).find(
    (unit) =>
      unit.inView &&
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
  if (structuralReach(leg) === "unsupported_map")
    return structuralAsk(
      "unsupported_map",
      scene.choice.unit?.name ?? "the target",
    );
  const other = anotherTarget(scene);
  if (other) return againNext(scene, other);
  return nextCall("travel", { to: "explore" });
}

type Loss = { reason: string; what: string };

const LOST = "target_lost";
const LOSSES = {
  dead: {
    reason: "target_dead",
    what: "died before you reached it; another unit killed it",
  },
  gone: {
    reason: "target_not_observed",
    what: "is not in view any more; it may have died or despawned",
  },
  tapped: {
    reason: "tapped_by_other",
    what: "was tapped by another player; killing it gives you no loot, experience or quest credit",
  },
} satisfies Record<string, Loss>;

function lossOf(scene: Scene): Loss | undefined {
  const { choice, ops } = scene;
  if (choice.guid === undefined) return;
  if (scene.broken) return LOSSES.gone;
  const hex = guidHex(choice.guid);
  const unit = unitViews(ops).find((view) => view.guid === hex);
  if (!unit) return LOSSES.gone;
  if (!unit.alive) return LOSSES.dead;
  if (unit.tappedByOther && choice.mode !== "cycle") return LOSSES.tapped;
}

function anotherTarget(scene: Scene): UnitView | undefined {
  const { choice, ops, tally } = scene;
  const fought = new Set(tally.targets.map((target) => target.ref));
  const cap = selfView(ops).level + LEVEL_CAP_ABOVE;
  return (
    otherInView(scene) ??
    unitViews(ops).find(
      (unit) =>
        unit.inView &&
        unit.alive &&
        unit.level <= cap &&
        unit.attackable &&
        unit.relation === "hostile" &&
        !unit.tappedByOther &&
        unit.ref !== choice.unit?.ref &&
        !fought.has(unit.ref),
    )
  );
}

function againNext(scene: Scene, other: UnitView): string {
  const { wanted } = scene.choice;
  return wanted > 1
    ? nextCall("engage", { count: wanted, target: other.name })
    : nextCall("engage", { target: other.ref });
}

function lossReport(scene: Scene, loss: Loss): Report {
  const { choice, ops, walk } = scene;
  const who = `${choice.unit?.name} ${choice.unit?.ref}`;
  const tail = walk
    ? ` You walked ${Math.round(walk.yd)} yd; the fight did not start.`
    : " The fight did not start.";
  const other = anotherTarget(scene);
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `${who} ${loss.what}.${tail}`,
    next: other
      ? againNext(scene, other)
      : nextCall("travel", { to: "explore" }),
    reason: loss.reason,
  });
}

function watchLoss(scene: Scene): { signal: AbortSignal; off: () => void } {
  const lost = new AbortController();
  const check = (guid: bigint) => {
    if (guid !== scene.choice.guid || lost.signal.aborted) return;
    if (lossOf(scene)) lost.abort(new Error(LOST));
  };
  const offs = [
    scene.ops.handle.onEntityEvent((event) =>
      check(event.type === "disappear" ? event.guid : event.entity.guid),
    ),
    scene.ops.handle.threat.onEvent((event) => {
      if (event.type !== "target_broken" || event.unit !== scene.choice.guid)
        return;
      scene.broken = true;
      check(event.unit);
    }),
  ];
  const off = () => {
    for (const each of offs) each();
  };
  return { off, signal: lost.signal };
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
  const watch = watchLoss(scene);
  const leg = await travelLeg(
    { ...ops, signal: AbortSignal.any([ops.signal, watch.signal]) },
    {
      goal: { guid: choice.guid, kind: "unit", name: choice.unit.name },
      within: APPROACH_WITHIN_YD,
    },
  ).finally(watch.off);
  scene.walk = { ms: ops.rt.clock.now() - startedAt, yd: leg.traveledYd };
  if (leg.status === "arrived") return;
  const loss = watch.signal.aborted && !ops.signal.aborted && lossOf(scene);
  if (loss) return lossReport(scene, loss);
  const reason = leg.reason ?? leg.status;
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `could not reach ${choice.unit.name} ${choice.unit.ref}: ${leg.detail}.`,
    next: unreachedNext(scene, { detail: leg.detail, reason }),
    reason,
  });
}

export function unobserved(scene: Scene): Report | undefined {
  const { choice } = scene;
  if (choice.mode === "quest" || !choice.unit || choice.guid === undefined)
    return;
  const loss = lossOf(scene);
  return loss ? lossReport(scene, loss) : undefined;
}
