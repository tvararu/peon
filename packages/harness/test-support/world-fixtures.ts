import {
  type CombatState,
  type CombatUnit,
  type ControlPose,
  type ControlState,
  type Entity,
  type GameObjectEntity,
  type NearbyRow,
  ObjectType,
  type PlaceState,
  type RecoveryState,
  type UnitEntity,
  type WorldHandle,
} from "@peon/core";

export const SELF_GUID = 0x10n;
export const MAP_ID = 530;
export const ORIGIN = { x: 8735, y: -6685, z: 72 };

export type UnitInit = Partial<Omit<UnitEntity, "objectType" | "position">> & {
  dx?: number;
  dy?: number;
  player?: boolean;
};

export type WorldInit = {
  rows?: NearbyRow[];
  pose?: ControlPose;
  serverPose?: ControlPose;
  combat?: Partial<CombatState>;
  life?: RecoveryState["life"];
  place?: Partial<PlaceState>;
};

export function unitEntity(init: UnitInit = {}): UnitEntity {
  const { dx = 0, dy = 0, player = false, ...over } = init;
  return {
    class_: 0,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid: 0x100n,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [0],
    name: "Unit",
    npcFlags: 0,
    objectType: player ? ObjectType.PLAYER : ObjectType.UNIT,
    position: {
      mapId: MAP_ID,
      orientation: 0,
      x: ORIGIN.x + dx,
      y: ORIGIN.y + dy,
      z: ORIGIN.z,
    },
    power: [0],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
    ...over,
  };
}

export function gameObject(guid: bigint, name: string): GameObjectEntity {
  return {
    bytes1: 0,
    displayId: 0,
    entry: 0,
    flags: 0,
    gameObjectType: 0,
    guid,
    name,
    objectType: ObjectType.GAMEOBJECT,
    position: { mapId: MAP_ID, orientation: 0, ...ORIGIN },
    rawFields: new Map(),
    scale: 1,
  };
}

export function nearbyRow(
  entity: Entity,
  over: Partial<NearbyRow> = {},
): NearbyRow {
  const { position } = entity;
  const dx = position ? position.x - ORIGIN.x : 0;
  const dy = position ? position.y - ORIGIN.y : 0;
  const distance = position ? Math.hypot(dx, dy) : null;
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: position ? Math.atan2(dy, dx) : null,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: "server",
    originUpdatedAt: 0,
    position,
    positionKind: position ? "observed" : null,
    positionObservedAt: null,
    positionSource: position ? "update_object" : null,
    preparedAt: 0,
    relation: "unknown",
    remotePose: undefined,
    roles: [],
    self: entity.guid === SELF_GUID,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
    ...over,
  };
}

export function selfRow(over: UnitInit = {}): NearbyRow {
  const entity = unitEntity({
    class_: 5,
    guid: SELF_GUID,
    level: 10,
    name: "Fgklibhlflc",
    player: true,
    ...over,
  });
  return nearbyRow(entity, { self: true });
}

export function selfPose(
  at: number,
  over: Partial<ControlPose> = {},
): ControlPose {
  return {
    mapId: MAP_ID,
    orientation: 0,
    source: "predicted",
    updatedAt: at,
    ...ORIGIN,
    ...over,
  };
}

export function selfCombat(over: Partial<CombatUnit> = {}): CombatUnit {
  return {
    baseMana: undefined,
    guid: SELF_GUID,
    health: 217,
    level: 10,
    maxHealth: 217,
    maxPower: 100,
    motion: undefined,
    name: "Fgklibhlflc",
    pose: undefined,
    power: 100,
    powerType: 0,
    serverPose: undefined,
    ...over,
  };
}

export function setWorld(handle: WorldHandle, init: WorldInit): void {
  const rows = init.rows ?? [];
  const control: ControlState = {
    ...handle.getControlState(),
    pose: init.pose,
    selfGuid: SELF_GUID,
    serverPose: init.serverPose,
  };
  const combat: CombatState = {
    ...handle.getCombatState(),
    self: selfCombat(),
    ...init.combat,
  };
  const recovery: RecoveryState = {
    ...handle.getRecoveryState(),
    life: init.life ?? "alive",
  };
  const place: PlaceState = {
    area: undefined,
    areaId: undefined,
    at: undefined,
    mapId: undefined,
    zone: undefined,
    zoneId: undefined,
    ...init.place,
  };
  handle.getControlState = () => control;
  handle.getCombatState = () => combat;
  handle.getRecoveryState = () => recovery;
  handle.getPlaceState = () => place;
  handle.getNearbyEntities = () => rows.map((row) => row.entity);
  handle.queryNearby = () => rows;
}
