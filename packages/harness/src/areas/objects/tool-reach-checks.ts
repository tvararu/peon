import {
  inDisplayReach,
  interactionRadius,
} from "#harness/areas/objects/reach";
import {
  isGameObjectEntity,
  isObjectRef,
  type ObjectRow,
  reachYd,
  resolveObjectRef,
} from "#harness/areas/objects/reads";
import type { UseCtx } from "#harness/areas/objects/tool";
import type { ViewCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { nextCall } from "#harness/tools/next-call";

const REACH_MARGIN_YD = 6;

const USABLE: Record<number, true> = {
  0: true,
  1: true,
  2: true,
  3: true,
  8: true,
  9: true,
  10: true,
  22: true,
};

export function findObject(ctx: UseCtx, object: string): ObjectRow {
  const row = resolveObjectRef(ctx, object);
  if (!row || (isObjectRef(object) && row.ref !== object.trim()))
    throw new Refusal({
      detail: `no object named ${object} is nearby; look for it first.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_found",
    });
  return row;
}
export function checkUsable(row: ObjectRow): void {
  if (!USABLE[row.type])
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
}

export function checkReach(row: ObjectRow, ctx?: ViewCtx): void {
  if (ctx && displayHit(row, ctx, interactionRadius(row.type))) return;
  refuseWhenFar(row, reachYd(row, ctx));
}

export function checkCastReach(row: ObjectRow, ctx?: ViewCtx): void {
  if (
    ctx &&
    displayHit(row, ctx, interactionRadius(row.type) + REACH_MARGIN_YD)
  )
    return;
  refuseWhenFar(row, reachYd(row, ctx) + REACH_MARGIN_YD);
}

function displayHit(row: ObjectRow, ctx: ViewCtx, radius: number): boolean {
  if (row.x === undefined || row.y === undefined || row.z === undefined)
    return false;
  const pose = ctx.handle.getControlState().pose;
  if (!pose) return false;
  const state = ctx.handle.objects.state();
  const displayId = state.templates.get(row.entry)?.displayId;
  const bounds =
    displayId === undefined ? undefined : state.displays?.get(displayId);
  const entity = ctx.handle.getEntity(row.guid);
  if (bounds === undefined || !isGameObjectEntity(entity)) return false;
  const facing = entity.position?.orientation ?? 0;
  return inDisplayReach(
    { x: pose.x, y: pose.y, z: pose.z },
    {
      at: { x: row.x, y: row.y, z: row.z },
      bounds,
      rotation: entity.rotation ?? {
        w: Math.cos(facing / 2),
        x: 0,
        y: 0,
        z: Math.sin(facing / 2),
      },
      scale: entity.scale,
      type: row.type,
    },
    radius,
  );
}

function refuseWhenFar(row: ObjectRow, limit: number): void {
  if (row.distance === undefined || row.distance <= limit) return;
  throw new Refusal({
    detail: `${row.name} (${row.ref}) is ${row.distance} yd away; walk to it first.`,
    next: nextCall("travel", { to: row.ref }),
    reason: "too_far",
  });
}
