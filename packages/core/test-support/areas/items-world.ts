import { areaRig } from "#test-support/area-rig";
import type { AreaHandle } from "#wow/areas/compose";
import type { SentPacket } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import {
  CONTAINER_FIELDS,
  ITEM_FIELDS,
  OBJECT_FIELDS,
  PLAYER_FIELDS,
  UNIT_FIELDS,
} from "#wow/protocol/update-fields";
import type { OpcodeDispatch } from "#wow/protocol/world";
import type { SessionStores } from "#wow/session-stores";
import type { WorldEvents } from "#wow/world-events";

export type HeldItem = {
  guid: bigint;
  entry: number;
  count?: number;
  bagSlots?: number;
};

const ROOT_SLOTS = 39;
const EXTRA_ROOTS = [
  PLAYER_FIELDS.KEYRING_SLOT_1,
  PLAYER_FIELDS.CURRENCYTOKEN_SLOT_1,
];
const low = (guid: bigint) => Number(guid & 0xff_ff_ff_ffn);
const high = (guid: bigint) => Number(guid >> 32n);

function setGuid(fields: Map<number, number>, offset: number, guid: bigint) {
  fields.set(offset, low(guid));
  fields.set(offset + 1, high(guid));
}

function readGuid(fields: ReadonlyMap<number, number>, offset: number): bigint {
  return (
    BigInt(fields.get(offset) ?? 0) |
    (BigInt(fields.get(offset + 1) ?? 0) << 32n)
  );
}

const FIELDS = new WeakMap<Entity, Map<number, number>>();

function blank(guid: bigint, objectType: ObjectType, entry = 0): Entity {
  const rawFields = new Map<number, number>();
  const entity = {
    entry,
    guid,
    name: undefined,
    objectType,
    position: undefined,
    rawFields,
    scale: 1,
  };
  FIELDS.set(entity, rawFields);
  return entity;
}

function fieldsOf(entity: Entity): Map<number, number> {
  const fields = FIELDS.get(entity);
  if (!fields) throw new Error(`entity ${entity.guid} has no test fields`);
  return fields;
}

export function itemsWorld(self: bigint) {
  const entities = new Map<bigint, Entity>();
  const player = blank(self, ObjectType.PLAYER);
  entities.set(self, player);
  const own = fieldsOf(player);
  for (let slot = 0; slot < ROOT_SLOTS; slot++)
    setGuid(own, PLAYER_FIELDS.INV_SLOT_HEAD.offset + slot * 2, 0n);
  for (const range of EXTRA_ROOTS)
    for (let i = 0; i < range.size; i++) own.set(range.offset + i, 0);
  own.set(UNIT_FIELDS.HEALTH.offset, 100);
  own.set(PLAYER_FIELDS.FLAGS.offset, 0);
  own.set(PLAYER_FIELDS.AMMO_ID.offset, 0);

  const rootOffset = (slot: number) =>
    PLAYER_FIELDS.INV_SLOT_HEAD.offset + slot * 2;
  const holder = (bag: number) =>
    bag === 255 ? player : entities.get(readGuid(own, rootOffset(bag)));
  const slotOffset = (bag: number, slot: number) =>
    bag === 255 ? rootOffset(slot) : CONTAINER_FIELDS.SLOT_1.offset + slot * 2;

  function put(bag: number, slot: number, item: HeldItem): Entity {
    const parent = holder(bag);
    if (!parent) throw new Error(`no bag in slot ${bag}`);
    const container = item.bagSlots !== undefined;
    const entity = blank(
      item.guid,
      container ? ObjectType.CONTAINER : ObjectType.ITEM,
      item.entry,
    );
    const f = fieldsOf(entity);
    f.set(OBJECT_FIELDS.ENTRY.offset, item.entry);
    setGuid(f, ITEM_FIELDS.OWNER.offset, self);
    setGuid(f, ITEM_FIELDS.CONTAINED.offset, parent.guid);
    f.set(ITEM_FIELDS.STACK_COUNT.offset, item.count ?? 1);
    f.set(ITEM_FIELDS.FLAGS.offset, 0);
    f.set(ITEM_FIELDS.RANDOM_PROPERTIES_ID.offset, 0);
    f.set(ITEM_FIELDS.DURABILITY.offset, 0);
    f.set(ITEM_FIELDS.MAXDURABILITY.offset, 0);
    if (container) {
      f.set(CONTAINER_FIELDS.NUM_SLOTS.offset, item.bagSlots ?? 0);
      for (let i = 0; i < (item.bagSlots ?? 0); i++)
        setGuid(f, CONTAINER_FIELDS.SLOT_1.offset + i * 2, 0n);
    }
    entities.set(item.guid, entity);
    setGuid(fieldsOf(parent), slotOffset(bag, slot), item.guid);
    return entity;
  }

  function clear(bag: number, slot: number): void {
    const parent = holder(bag);
    if (parent) setGuid(fieldsOf(parent), slotOffset(bag, slot), 0n);
  }

  function setCount(guid: bigint, count: number): void {
    const entity = entities.get(guid);
    if (entity) fieldsOf(entity).set(ITEM_FIELDS.STACK_COUNT.offset, count);
  }

  function setHealth(health: number): void {
    own.set(UNIT_FIELDS.HEALTH.offset, health);
  }

  function setAmmo(entry: number): void {
    own.set(PLAYER_FIELDS.AMMO_ID.offset, entry);
  }

  return {
    clear,
    entities,
    lookup: (guid: bigint) => entities.get(guid),
    player,
    put,
    setAmmo,
    setCount,
    setHealth,
  };
}

export type ItemsWorld = ReturnType<typeof itemsWorld>;

export type ItemsRig = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<"items">;
  sent: readonly SentPacket[];
  events: WorldEvents;
  inject: (opcode: number, body: Uint8Array) => void;
  touch: () => void;
  dispose: () => void;
};

export function itemsRig(
  world: ItemsWorld,
  register?: (dispatch: OpcodeDispatch, stores: SessionStores) => void,
): ItemsRig {
  const rig = areaRig("items", {
    getEntity: world.lookup,
    register,
    selfGuid: world.player.guid,
  });
  return {
    ...rig,
    handle: rig.handle,
    touch: () =>
      rig.events.entity.emit({
        changed: [],
        entity: world.player,
        type: "update",
      }),
  };
}
