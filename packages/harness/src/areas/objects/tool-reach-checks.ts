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

const PLAYER_SIZE_YD = 0.389;

type DisplayVerdict = boolean | undefined;

export function checkReach(row: ObjectRow, ctx?: ViewCtx): void {
  if (!ctx) {
    refuseWhenFar(row, reachYd(row));
    return;
  }
  const hit = displayVerdict(row, ctx, 0);
  if (hit === true) return;
  if (hit === false)
    throw new Refusal({
      detail: refuseDetail(row),
      next: nextCall("travel", { to: row.ref }),
      reason: "too_far",
    });
  refuseWhenFar(row, reachYd(row, ctx));
}

export function checkCastReach(row: ObjectRow, ctx?: ViewCtx): void {
  if (!ctx) {
    refuseWhenFar(row, reachYd(row) + REACH_MARGIN_YD);
    return;
  }
  const hit = displayVerdict(row, ctx, REACH_MARGIN_YD);
  if (hit === true) return;
  if (hit === false) return;
  refuseWhenFar(row, reachYd(row, ctx) + REACH_MARGIN_YD);
}

function displayVerdict(
  row: ObjectRow,
  ctx: ViewCtx,
  extra: number,
): DisplayVerdict {
  if (row.x === undefined || row.y === undefined || row.z === undefined)
    return undefined;
  const pose = ctx.handle.getControlState().pose;
  if (!pose) return undefined;
  const state = ctx.handle.objects.state();
  const displayId = state.templates.get(row.entry)?.displayId;
  const bounds =
    displayId === undefined ? undefined : state.displays?.get(displayId);
  const entity = ctx.handle.getEntity(row.guid);
  if (bounds === undefined || !isGameObjectEntity(entity)) return undefined;
  const facing = entity.position?.orientation ?? 0;
  const target = {
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
  };
  const at = { x: pose.x, y: pose.y, z: pose.z };
  if (!inDisplayReach(at, target, interactionRadius(row.type) + extra))
    return false;
  if (extra > 0) return true;
  return (
    Math.hypot(at.x - target.at.x, at.y - target.at.y, at.z - target.at.z) <=
    interactionRadius(target.type) + PLAYER_SIZE_YD
  );
}

function refuseDetail(row: ObjectRow): string {
  const distance =
    row.distance === undefined ? "an unknown distance" : `${row.distance} yd`;
  return `${row.name} (${row.ref}) is ${distance} away; walk to it first.`;
}

function refuseWhenFar(row: ObjectRow, limit: number): void {
  if (row.distance === undefined || row.distance <= limit) return;
  throw new Refusal({
    detail: `${row.name} (${row.ref}) is ${row.distance} yd away; walk to it first.`,
    next: nextCall("travel", { to: row.ref }),
    reason: "too_far",
  });
}
