import type { WorldHandle } from "#wow/client";
import type { ControlRuntime, WalkOutcome } from "#wow/control";
import { bearing } from "#wow/geometry";
import type { NavPoint } from "#wow/ground-step";
import { type NearbySources, type NearbyUnits, queryNearby } from "#wow/nearby";
import type { Runtimes } from "#wow/runtime";
import { targetRelation } from "#wow/unit-relation";
import type { WorldConn } from "#wow/world-conn";

async function walkTowardPoint(
  rt: Runtimes,
  destination: NavPoint,
  yards: number,
  signal: AbortSignal | undefined,
): Promise<WalkOutcome> {
  if (!Number.isFinite(yards) || yards <= 0 || yards > 20)
    throw new Error("invalid_distance");
  const pose = rt.control.snapshot().pose;
  if (!pose) throw new Error("no_pose");
  if (signal?.aborted)
    return { status: "stopped", reason: "abort", traveled: 0, pose };
  try {
    return await rt.control.walkToward(destination, yards, signal);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "movement_unavailable";
    return {
      status: "stopped",
      reason,
      traveled: 0,
      pose: rt.control.snapshot().pose ?? pose,
    };
  }
}

function unitRelationOf(conn: WorldConn, rt: Runtimes) {
  const entity = (guid: bigint) => conn.entityStore.get(guid);
  const deps = {
    entity,
    factions: rt.factions,
    reputation: rt.areas.runtimes.reputation.act.relationView(),
  };
  const self = rt.control.snapshot().selfGuid;
  return (guid: bigint) => targetRelation(deps, guid, self);
}

function nearbySources(conn: WorldConn, rt: Runtimes): NearbySources {
  const control = rt.control.snapshot();
  const units: NearbyUnits = {
    relation: unitRelationOf(conn, rt),
    attackingMe: (guid) => rt.combat.isAttackingSelf(guid),
  };
  return {
    control,
    entities: conn.entityStore.all(),
    now: Date.now(),
    observedPosition: (guid) => rt.combat.observedPosition(guid),
    remotePoses: conn.remoteMotion.all(),
    units,
  };
}

function airMethods(control: ControlRuntime) {
  return {
    setSwimming(on) {
      control.setSwimming(on);
    },
    setFlying(on) {
      control.setFlying(on);
    },
    pitch(kind) {
      control.pitch(kind);
    },
    ascend(kind) {
      control.ascend(kind);
    },
    descend() {
      control.descend();
    },
  } satisfies Partial<WorldHandle>;
}

export function controlMethods(conn: WorldConn, rt: Runtimes) {
  const { control } = rt;
  return {
    getControlState() {
      return control.snapshot();
    },
    move(direction, durationMs) {
      control.move(direction, durationMs);
    },
    drive(input, durationMs) {
      control.drive(input, durationMs);
    },
    jump() {
      control.jump();
    },
    face(orientation) {
      control.face(orientation);
    },
    faceGuid(guid) {
      const target = rt.observedTarget(guid);
      const pose = control.snapshot().pose;
      if (!pose) throw new Error("no_pose");
      if (pose.x === target.x && pose.y === target.y)
        throw new Error("target_coincident");
      control.face(bearing(pose, target));
    },
    walkTowardPoint(target, yards, signal) {
      return walkTowardPoint(rt, target, yards, signal);
    },
    selectTarget(guid) {
      control.selectTarget(guid);
    },
    stopMoving(reason) {
      control.halt(reason);
    },
    ...airMethods(control),
    observedPosition(guid) {
      return rt.observedTarget(guid);
    },
    unitRelation(guid) {
      return unitRelationOf(conn, rt)(guid);
    },
    halt() {
      rt.recovery.clearSpiritHealer("halt");
      rt.halt();
    },
    follow(guide, facing, durationMs) {
      control.follow(guide, facing, durationMs);
    },
    onMovementStop(cb) {
      return control.onStop(cb);
    },
    onControlEvent(cb) {
      return conn.events.control.subscribe(cb);
    },
    getRemotePoses() {
      return conn.remoteMotion.all();
    },
    queryNearby(query) {
      return queryNearby(nearbySources(conn, rt), query);
    },
    onRemoteMotionEvent(cb) {
      return conn.events.remoteMotion.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}
