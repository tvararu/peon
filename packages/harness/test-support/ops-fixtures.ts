import { jest } from "bun:test";
import {
  type Entity,
  type FactionRelation,
  type GameObjectEntity,
  type NearbyRow,
  type NpcRole,
  ObjectType,
  type PlayerLife,
  type UnitEntity,
} from "@peon/core";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { GotoTarget } from "#harness/navigation/goto";
import {
  formatContent,
  MAX_CONTENT_BYTES,
  MAX_CONTENT_LINES,
} from "#harness/tools/define";
import type { MockHandle, TestRuntime } from "#test-support/runtime-fixture";

export const MAP_ID = 530;

export type UnitInit = {
  guid: bigint;
  name: string;
  x: number;
  y: number;
  z?: number;
  distance: number;
  entry?: number;
  level?: number;
  hp?: number;
  maxHp?: number;
  relation?: FactionRelation;
  attackable?: boolean;
  attackingMe?: boolean;
  roles?: NpcRole[];
  lootable?: boolean;
  tappedByOther?: boolean;
  player?: boolean;
};

function rowOf(
  entity: UnitEntity | GameObjectEntity,
  distance: number,
): NearbyRow {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: 0,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: "server",
    originUpdatedAt: 0,
    position: entity.position,
    positionKind: "observed",
    positionObservedAt: 0,
    positionSource: "control",
    preparedAt: 0,
    relation: "unknown",
    remotePose: undefined,
    roles: [],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: 0,
  };
}

export function unitRow(init: UnitInit): NearbyRow {
  const relation = init.relation ?? "hostile";
  const entity: UnitEntity = {
    class_: 0,
    createComplete: true,
    displayId: 0,
    entry: init.entry ?? 1,
    factionTemplate: 0,
    gender: 0,
    guid: init.guid,
    health: init.hp ?? 100,
    level: init.level ?? 1,
    maxHealth: init.maxHp ?? 100,
    maxPower: [],
    name: init.name,
    npcFlags: 0,
    objectType: init.player ? ObjectType.PLAYER : ObjectType.UNIT,
    position: {
      mapId: MAP_ID,
      orientation: 0,
      x: init.x,
      y: init.y,
      z: init.z ?? 0,
    },
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return {
    ...rowOf(entity, init.distance),
    attackable: init.attackable ?? relation !== "friendly",
    attackingMe: init.attackingMe ?? false,
    lootable: init.lootable ?? false,
    relation,
    roles: init.roles ?? [],
    tapped: init.tappedByOther ?? false,
    tappedByOther: init.tappedByOther ?? false,
  };
}

export function objectRow(init: {
  guid: bigint;
  name: string;
  x: number;
  y: number;
  distance: number;
  z?: number;
}): NearbyRow {
  const entity: GameObjectEntity = {
    bytes1: 0,
    createComplete: true,
    displayId: 0,
    entry: 1,
    flags: 0,
    gameObjectType: 0,
    guid: init.guid,
    name: init.name,
    objectType: ObjectType.GAMEOBJECT,
    position: {
      mapId: MAP_ID,
      orientation: 0,
      x: init.x,
      y: init.y,
      z: init.z ?? 0,
    },
    rawFields: new Map(),
    scale: 1,
  };
  return rowOf(entity, init.distance);
}

export function setUnits(handle: MockHandle, rows: readonly NearbyRow[]): void {
  handle.queryNearby = () => [...rows];
  handle.getNearbyEntities = () => rows.map((row) => row.entity);
  const byGuid = new Map<bigint, Entity>(
    rows.map((row) => [row.entity.guid, row.entity]),
  );
  const previous = handle.getEntity;
  handle.getEntity = jest.fn(
    (guid: bigint): Entity | undefined => byGuid.get(guid) ?? previous(guid),
  );
}

export type SelfInit = {
  hp?: number;
  maxHp?: number;
  power?: number;
  maxPower?: number;
  powerType?: number;
  level?: number;
  life?: PlayerLife;
  x?: number;
  y?: number;
  z?: number;
};

export function moveTo(
  handle: MockHandle,
  at: { x: number; y: number; z?: number },
): void {
  const control = handle.getControlState();
  const pose = {
    mapId: MAP_ID,
    orientation: 0,
    source: "server" as const,
    updatedAt: 0,
    x: at.x,
    y: at.y,
    z: at.z ?? 0,
  };
  handle.getControlState = () => ({ ...control, pose, serverPose: pose });
}

export function setSelf(handle: MockHandle, init: SelfInit = {}): void {
  const combat = handle.getCombatState();
  const recovery = handle.getRecoveryState();
  const self = {
    ...combat.self,
    health: init.hp ?? 200,
    level: init.level ?? 10,
    maxHealth: init.maxHp ?? 200,
    maxPower: init.maxPower ?? 300,
    power: init.power ?? 300,
    powerType: init.powerType ?? 0,
  };
  handle.getCombatState = () => ({ ...combat, self });
  handle.getRecoveryState = () => ({ ...recovery, life: init.life ?? "alive" });
  moveTo(handle, { x: init.x ?? 0, y: init.y ?? 0, z: init.z ?? 0 });
}

export type GotoPlan = {
  arrive?: { x: number; y: number; z?: number };
  refuse?: string;
  floors?: number[];
  hold?: boolean;
  onArrive?: () => void;
};

export function driveGoto(handle: MockHandle, plans: readonly GotoPlan[]) {
  const idle = handle.getNavigationState();
  let calls = 0;
  const goTo = jest.fn((_target: GotoTarget) => {
    const plan = plans[Math.min(calls, plans.length - 1)] ?? {};
    calls += 1;
    if (plan.refuse !== undefined) {
      handle.getNavigationState = () => ({
        ...idle,
        blockedReason: plan.refuse,
        floors: plan.floors,
      });
      throw new Error(plan.refuse);
    }
    handle.getNavigationState = () => ({ ...idle, active: true });
    if (plan.hold) return;
    queueMicrotask(() => {
      if (plan.arrive) moveTo(handle, plan.arrive);
      plan.onArrive?.();
      handle.getNavigationState = () => ({ ...idle, active: false });
      handle.triggerControlEvent({
        reason: "arrived",
        state: handle.getControlState(),
        type: "movement_stopped",
      });
    });
  });
  handle.goTo = goTo;
  return goTo;
}

export function attackBy(handle: MockHandle, guid: bigint): void {
  const state = handle.getCombatState();
  const next = { ...state, attackers: [...state.attackers, guid] };
  handle.getCombatState = () => next;
  handle.triggerCombatEvent({ attacker: guid, state: next, type: "attacked" });
}

export function setLife(handle: MockHandle, life: PlayerLife): void {
  const state = { ...handle.getRecoveryState(), life };
  handle.getRecoveryState = () => state;
  handle.triggerRecoveryEvent({ at: 0, state, type: "life_observed" });
}

export function die(handle: MockHandle): void {
  setLife(handle, "dead");
}

export type TestToolCtx<A> = ToolCtx<A> & {
  updates: ToolResult<A>[];
  progressed: string[];
};

export function toolCtx<A>(
  t: TestRuntime,
  signal: AbortSignal = new AbortController().signal,
): TestToolCtx<A> {
  const updates: ToolResult<A>[] = [];
  const progressed: string[] = [];
  return {
    handle: t.handle,
    progress: (text) => {
      progressed.push(text);
    },
    progressed,
    rt: t.rt,
    signal,
    toolCallId: "call-1",
    update: (partial) => {
      updates.push(partial);
    },
    updates,
  };
}

export function contentOf(
  res: ToolResult<unknown>,
  maxLines = MAX_CONTENT_LINES,
): string {
  return formatContent(res, { danger: undefined, maxLines });
}

export function limitProblem(
  text: string,
  maxLines = MAX_CONTENT_LINES,
): string | undefined {
  const lines = text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  if (lines > maxLines) return `${lines} lines, limit ${maxLines}`;
  if (bytes > MAX_CONTENT_BYTES)
    return `${bytes} bytes, limit ${MAX_CONTENT_BYTES}`;
}
