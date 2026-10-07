import type { SpellDefinition } from "@peon/core";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { distanceTo } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { poseView } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";
import type { TravelArgs } from "#harness/tools/params-travel";
import type { Goal } from "#harness/tools/travel-report";

export const MOUNT_HINT_YD = 100;

const APPLY_AURA_EFFECT = 6;
const MOUNTED_AURA = 78;
const FLIGHT_SPEED_AURA = 207;
const ONLY_OUTDOORS = 0x80_00;
const UINT32 = 2 ** 32;

const OPEN_WORLD_MAPS: readonly number[] = [0, 1, 530, 571];

function flagged(value: number, mask: number): boolean {
  const unsigned = value < 0 ? value + UINT32 : value;
  return Math.floor(unsigned / mask) % 2 === 1;
}

function isGroundMount(definition: SpellDefinition): boolean {
  if (!flagged(definition.attributes.raw, ONLY_OUTDOORS)) return false;
  const auras = definition.effects
    .filter((effect) => effect.effect === APPLY_AURA_EFFECT)
    .map((effect) => effect.applyAura);
  return auras.includes(MOUNTED_AURA) && !auras.includes(FLIGHT_SPEED_AURA);
}

function mountSpeed(definition: SpellDefinition): number {
  const points = definition.effects
    .filter(
      (effect) =>
        effect.effect === APPLY_AURA_EFFECT && effect.applyAura === 32,
    )
    .map((effect) => effect.basePoints);
  return points.length > 0 ? Math.max(...points) : 0;
}

async function bestGroundMount(
  ctx: ToolCtx<TravelAfter>,
): Promise<SpellDefinition | undefined> {
  const book = await ctx.handle.getSpellbook();
  const learned = new Set(ctx.handle.getCombatState().learned);
  const ranks = book
    .filter((spell) => isGroundMount(spell) && learned.has(spell.id))
    .sort((a, b) => mountSpeed(b) - mountSpeed(a));
  return ranks.at(0);
}

function distanceOf(ctx: ToolCtx<TravelAfter>, goal: Goal): number | undefined {
  if (goal.kind === "unit") return distanceTo(ctx, goal.guid);
  if (goal.kind !== "point") return undefined;
  const pose = poseView(ctx);
  if (!pose) return undefined;
  return Math.hypot(pose.x - goal.x, pose.y - goal.y);
}

function isLongOutdoorWalk(ctx: ToolCtx<TravelAfter>, goal: Goal): boolean {
  if (ctx.handle.selfstate.state().mounted) return false;
  const pose = poseView(ctx);
  if (!(pose && OPEN_WORLD_MAPS.includes(pose.mapId))) return false;
  const distance = distanceOf(ctx, goal);
  return distance !== undefined && distance > MOUNT_HINT_YD;
}

export function mountRefusal(
  ctx: ToolCtx<TravelAfter>,
  goal: Goal,
  args: TravelArgs,
): Promise<Refusal | undefined> | undefined {
  if (args.on_foot || !isLongOutdoorWalk(ctx, goal)) return undefined;
  return bestGroundMount(ctx).then(
    (spell) =>
      spell &&
      new Refusal({
        detail: `a ground mount is ready and this walk is long; ${nextCall("travel", { on_foot: true, to: args.to })} walks it on foot.`,
        next: nextCall("spell", { do: "mount", spell: spell.name }),
        reason: "mount_available",
      }),
    () => undefined,
  );
}
