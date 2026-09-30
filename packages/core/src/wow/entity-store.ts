import { Emitter, type Unsubscribe } from "#lib/emitter";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { Rotation } from "#wow/protocol/movement-block";

export type Position = {
  mapId: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
};

type BaseFields = {
  guid: bigint;
  objectType: ObjectType;
  entry: number;
  scale: number;
  position: Position | undefined;
  rawFields: Map<number, number>;
  createComplete?: boolean;
  name: string | undefined;
};

type UnitFields = BaseFields & {
  objectType: typeof ObjectType.UNIT | typeof ObjectType.PLAYER;
  health: number;
  maxHealth: number;
  level: number;
  factionTemplate: number;
  displayId: number;
  npcFlags: number;
  unitFlags: number;
  target: bigint;
  race: number;
  class_: number;
  gender: number;
  powerType?: number;
  baseMana?: number;
  combatReach?: number;
  power: number[];
  maxPower: number[];
};
type GameObjectFields = BaseFields & {
  objectType: typeof ObjectType.GAMEOBJECT;
  displayId: number;
  flags: number;
  gameObjectType: number;
  bytes1: number;
  rotation?: Rotation | undefined;
};

type View<T> = {
  readonly [K in keyof T]: T[K] extends Map<infer K2, infer V>
    ? ReadonlyMap<K2, V>
    : T[K] extends (infer E)[]
      ? readonly E[]
      : T[K] extends object | undefined
        ? Readonly<T[K]>
        : T[K];
};

export type BaseEntity = View<BaseFields>;
export type UnitEntity = View<UnitFields>;
export type GameObjectEntity = View<GameObjectFields>;
export type Entity = UnitEntity | GameObjectEntity | BaseEntity;

type StoredEntity = UnitFields | GameObjectFields | BaseFields;

export type EntityLookup = (guid: bigint) => Entity | undefined;

export function isUnit(entity: Entity | undefined): entity is UnitEntity {
  return (
    entity?.objectType === ObjectType.UNIT ||
    entity?.objectType === ObjectType.PLAYER
  );
}

export function fieldOf(
  entity: Entity | undefined,
  offset: number,
): number | undefined {
  return (
    entity?.rawFields.get(offset) ?? (entity?.createComplete ? 0 : undefined)
  );
}

export type EntityEvent =
  | { readonly type: "appear"; readonly entity: Entity }
  | {
      readonly type: "disappear";
      readonly guid: bigint;
      readonly name?: string;
    }
  | {
      readonly type: "update";
      readonly entity: Entity;
      readonly changed: readonly string[];
    };

export function snapshotEntityEvent(event: EntityEvent): EntityEvent {
  if (event.type === "disappear") return event;
  return { ...event, entity: structuredClone(event.entity) };
}

function createBase(guid: bigint, objectType: ObjectType): BaseFields {
  return {
    guid,
    objectType,
    entry: 0,
    scale: 0,
    position: undefined,
    rawFields: new Map(),
    name: undefined,
  };
}

function createUnit(
  guid: bigint,
  objectType: typeof ObjectType.UNIT | typeof ObjectType.PLAYER,
): UnitFields {
  return {
    ...createBase(guid, objectType),
    objectType,
    health: 0,
    maxHealth: 0,
    level: 0,
    factionTemplate: 0,
    displayId: 0,
    npcFlags: 0,
    unitFlags: 0,
    target: 0n,
    race: 0,
    class_: 0,
    gender: 0,
    power: [0, 0, 0, 0, 0, 0, 0],
    maxPower: [0, 0, 0, 0, 0, 0, 0],
  };
}

function createGameObject(guid: bigint): GameObjectFields {
  return {
    ...createBase(guid, ObjectType.GAMEOBJECT),
    objectType: ObjectType.GAMEOBJECT,
    displayId: 0,
    flags: 0,
    gameObjectType: 0,
    bytes1: 0,
    rotation: undefined,
  };
}

type EntityFields = Partial<
  Omit<UnitFields, "objectType"> & Omit<GameObjectFields, "objectType">
>;

export class EntityStore {
  private readonly entities = new Map<bigint, StoredEntity>();
  private readonly byType = new Map<number, Set<bigint>>();
  private readonly events = new Emitter<[EntityEvent]>();

  onEvent(cb: (event: EntityEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  create(guid: bigint, objectType: ObjectType, fields: EntityFields): void {
    const existing = this.remove(guid);
    if (existing)
      this.events.emit({ type: "disappear", guid, name: existing.name });

    let entity: StoredEntity;
    if (objectType === ObjectType.UNIT || objectType === ObjectType.PLAYER) {
      entity = Object.assign(createUnit(guid, objectType), fields);
    } else if (objectType === ObjectType.GAMEOBJECT) {
      entity = Object.assign(createGameObject(guid), fields);
    } else {
      entity = Object.assign(createBase(guid, objectType), fields);
    }

    this.entities.set(guid, entity);

    let typeSet = this.byType.get(objectType);
    if (!typeSet) {
      typeSet = new Set();
      this.byType.set(objectType, typeSet);
    }
    typeSet.add(guid);

    this.events.emit({ type: "appear", entity });
  }

  update(
    guid: bigint,
    fields: Record<string, unknown>,
    rawFields?: ReadonlyMap<number, number>,
  ): void {
    const entity = this.entities.get(guid);
    if (!entity) return;

    const changed: string[] = [];
    const rec = entity as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
      changed.push(key);
      if (Array.isArray(value) && Array.isArray(rec[key])) {
        const existing = rec[key] as unknown[];
        rec[key] = existing.map((v, i) => (value as unknown[])[i] ?? v);
      } else {
        rec[key] = value;
      }
    }
    if (rawFields) {
      for (const [offset, value] of rawFields)
        entity.rawFields.set(offset, value);
      changed.push("rawFields");
    }

    if (changed.length > 0) {
      this.events.emit({ type: "update", entity, changed });
    }
  }

  destroy(guid: bigint): void {
    const entity = this.remove(guid);
    if (entity)
      this.events.emit({ type: "disappear", guid, name: entity.name });
  }

  clear(): void {
    const removed = [...this.entities.values()];
    this.entities.clear();
    this.byType.clear();
    for (const { guid, name } of removed)
      this.events.emit({ type: "disappear", guid, name });
  }

  get(guid: bigint): Entity | undefined {
    return this.entities.get(guid);
  }

  getByType(type: ObjectType): Entity[] {
    const guids = this.byType.get(type);
    if (!guids) return [];
    const result: Entity[] = [];
    for (const guid of guids) {
      const entity = this.entities.get(guid);
      if (entity) result.push(entity);
    }
    return result;
  }

  all(): Entity[] {
    return [...this.entities.values()];
  }

  setName(guid: bigint, name: string): void {
    const entity = this.entities.get(guid);
    if (!entity) return;
    entity.name = name;
    this.events.emit({ type: "update", entity, changed: ["name"] });
  }

  setPosition(guid: bigint, pos: Position): void {
    const entity = this.entities.get(guid);
    if (!entity) return;
    entity.position = pos;
    this.events.emit({ type: "update", entity, changed: ["position"] });
  }

  private remove(guid: bigint): StoredEntity | undefined {
    const entity = this.entities.get(guid);
    if (!entity) return undefined;
    this.entities.delete(guid);
    this.byType.get(entity.objectType)?.delete(guid);
    return entity;
  }
}
