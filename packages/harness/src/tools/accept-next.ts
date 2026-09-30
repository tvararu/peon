import { type QuestState, questSlotStatus } from "@peon/core";
import { type QuestRegion, questRegion } from "#harness/areas/quests/reads";
import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { enderIn } from "#harness/ops/quest-memory";
import { knownUnits } from "#harness/ops/views";
import { triggersOf } from "#harness/tools/accept-trigger";
import { nextCall } from "#harness/tools/next-call";

type Accepted = { detail: string; next: string };
type Shown = { giver: string; objectives: string };

const FAR_YD = 40;
const STOP = /[.!?]$/;

function regionOf(ctx: ViewCtx, questId: number) {
  const pose = ctx.handle.getControlState().pose ?? undefined;
  const slot = ctx.handle
    .getQuestState()
    .log.slots.find((known) => known.questId === questId);
  if (!slot) return;
  const status =
    questSlotStatus(slot) === "complete" ? "complete" : "incomplete";
  return questRegion(
    { id: questId, status },
    ctx.handle.quests.state().pois,
    pose,
  );
}

function counted(state: QuestState, questId: number): boolean | undefined {
  const query = state.queries.find(
    (known) => known.questId === questId && known.status === "known",
  );
  if (query?.status === "known")
    return (
      query.data.targets.some((target) => target.count > 0) ||
      query.data.requiredItems.some((item) => item.count > 0)
    );
  const slot = state.log.slots.find((known) => known.questId === questId);
  if (slot && questSlotStatus(slot) === "complete") return false;
}

function objectivesOf(
  state: QuestState,
  questId: number,
  shown: string,
): string {
  if (shown.trim() !== "") return shown.trim();
  const query = state.queries.find((known) => known.questId === questId);
  if (query?.status === "known") return query.data.objectives.trim();
  return "";
}

function sentence(text: string): string {
  return STOP.test(text) ? text : `${text}.`;
}

function whereText(unit: UnitView): string {
  if (unit.distance === undefined) return unit.ref;
  const yards = `${Math.round(unit.distance)} yd${unit.compass ? ` ${unit.compass}` : ""}`;
  return `${unit.ref}, ${unit.inView ? yards : `last seen ${yards}`}`;
}

function goalNpc(ctx: ViewCtx, goal: string, ender: string | undefined) {
  const known = knownUnits(ctx).filter((unit) => unit.alive);
  const wanted = ender?.toLowerCase();
  return wanted
    ? known.find((unit) => unit.name.toLowerCase() === wanted)
    : known.find((unit) => goal !== "" && goal.includes(unit.name));
}

function withWhere(goal: string, unit: UnitView | undefined): string {
  if (!unit) return goal;
  const at = goal.indexOf(unit.name);
  if (at < 0) return goal;
  const end = at + unit.name.length;
  return `${goal.slice(0, end)} (${whereText(unit)})${goal.slice(end)}`;
}

export function acceptedNext(
  ctx: ViewCtx,
  offer: { id: number; title: string },
  shown: Shown,
): Accepted {
  const accepted = `accepted ${offer.title} #${offer.id}.`;
  const state = ctx.handle.getQuestState();
  const goal = objectivesOf(state, offer.id, shown.objectives);
  const ender = enderIn(goal);
  ctx.rt.quests.set(offer.id, {
    ender,
    giver: shown.giver,
    objectives: goal,
    title: offer.title,
  });
  const npc = goalNpc(ctx, goal, ender);
  const region = regionOf(ctx, offer.id);
  const regionText =
    region && "label" in region ? ` The quest region is ${region.label}.` : "";
  const pointed =
    goal === ""
      ? `${accepted}${regionText}`
      : `${accepted} Goal: ${sentence(withWhere(goal, npc))}${regionText}`;
  const toRegion =
    region && "to" in region
      ? regionNext(ctx, region, {
          counted: counted(state, offer.id),
          id: offer.id,
          pointed,
        })
      : undefined;
  if (toRegion) return toRegion;
  if (counted(state, offer.id) !== false)
    return {
      detail: pointed,
      next: nextCall("engage", { quest: String(offer.id) }),
    };
  if (ender)
    return { detail: pointed, next: nextCall("interact", { npc: ender }) };
  const named = npc?.inView ? npc : undefined;
  return {
    detail: `${pointed} It has nothing to kill or collect.`,
    next: named
      ? nextCall("interact", { do: "turn_in", npc: named.ref })
      : nextCall("look", { find: "questgiver" }),
  };
}

function regionNext(
  ctx: ViewCtx,
  region: QuestRegion,
  quest: { counted: boolean | undefined; id: number; pointed: string },
): Accepted | undefined {
  const { pointed } = quest;
  const chain = triggersOf(ctx, region);
  const [trigger, ...others] = chain;
  ctx.rt.travel.triggers = trigger
    ? { points: chain, questId: quest.id }
    : undefined;
  if (trigger)
    return {
      detail:
        others.length > 0
          ? `${pointed} Other area triggers in it: ${others.join("; ")}.`
          : pointed,
      next: nextCall("travel", { to: trigger }),
    };
  if (quest.counted !== false && farFrom(ctx, region.to))
    return {
      detail: pointed,
      next: nextCall("journal", { about: "quests" }),
    };
}

function pointOf(to: string): { x: number; y: number } | undefined {
  const [x, y] = to.split(",").map(Number);
  if (x === undefined || y === undefined) return undefined;
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return { x, y };
}

function farFrom(ctx: ViewCtx, to: string): boolean {
  const pose = ctx.handle.getControlState().pose;
  if (!pose) return true;
  const point = pointOf(to);
  if (!point) return false;
  return Math.hypot(pose.x - point.x, pose.y - point.y) >= FAR_YD;
}
