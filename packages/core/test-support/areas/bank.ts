import { areaRig } from "#test-support/area-rig";
import { type ItemsWorld, itemsWorld } from "#test-support/areas/items-world";
import type { AreaHandle } from "#wow/areas/compose";
import type { SentPacket } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import {
  registerLootHandlers,
  registerQuestHandlers,
} from "#wow/gameplay-handlers";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { OpcodeDispatch } from "#wow/protocol/world";
import type { SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";

export const BANK_ME = 0x0b_00n;
export const BANK_BANKER = 0xf1_30_00_00_00_00_00_55n;
export const BANK_CLOTH = 0x40_00_00_00_00_00_00_21n;

export function bankBuyBankSlotResultBody(result: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(result);
  return w.finish();
}

export function bankShowBankBody(banker: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(banker);
  return w.finish();
}

export function bankConn(dispatch: OpcodeDispatch): WorldConn {
  return { dispatch } as unknown as WorldConn;
}

export function bankRegisters(
  dispatch: OpcodeDispatch,
  stores: SessionStores,
): void {
  const conn = bankConn(dispatch);
  registerQuestHandlers(conn, stores);
  registerLootHandlers(conn, stores);
}

export type BankRig = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<"bank">;
  sent: readonly SentPacket[];
  inject: (opcode: number, body: Uint8Array) => void;
  touch: () => void;
  dispose: () => void;
};

const low = (guid: bigint) => Number(guid & 0xff_ff_ff_ffn);
const high = (guid: bigint) => Number(guid >> 32n);

function here() {
  return { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 };
}

export function bankBanker(): Entity {
  return {
    displayId: 0,
    entry: 1234,
    factionTemplate: 0,
    guid: BANK_BANKER,
    health: 100,
    level: 60,
    maxHealth: 100,
    name: undefined,
    npcFlags: 0x2_00_00,
    objectType: ObjectType.UNIT,
    position: here(),
    rawFields: new Map(),
    scale: 1,
    target: 0n,
  } as Entity;
}

export function bankCoinage(world: ItemsWorld, coinage: number): void {
  (world.player.rawFields as Map<number, number>).set(
    PLAYER_FIELDS.COINAGE.offset,
    coinage,
  );
}

export function bankSetRoot(
  world: ItemsWorld,
  slot: number,
  guid: bigint,
): void {
  const fields = world.player.rawFields as Map<number, number>;
  const offset = PLAYER_FIELDS.INV_SLOT_HEAD.offset + slot * 2;
  fields.set(offset, low(guid));
  fields.set(offset + 1, high(guid));
}

export function bankClear(world: ItemsWorld, slot: number): void {
  bankSetRoot(world, slot, 0n);
}

export function bankBagSlots(world: ItemsWorld, count: number): void {
  (world.player.rawFields as Map<number, number>).set(154, count << 16);
}

export function bankRig(
  world: ItemsWorld,
  register?: (dispatch: OpcodeDispatch, stores: SessionStores) => void,
): BankRig {
  const banker = bankBanker();
  const self = { ...world.player, position: here() } as Entity;
  const rig = areaRig("bank", {
    getEntity: (guid) => {
      if (guid === world.player.guid) return self;
      if (guid === BANK_BANKER) return banker;
      return world.lookup(guid);
    },
    register: register ?? bankRegisters,
    selfGuid: world.player.guid,
  });
  return {
    ...rig,
    touch: () =>
      rig.events.entity.emit({
        changed: [],
        entity: self,
        type: "update",
      }),
  };
}

export function bankScene(seed: (world: ItemsWorld) => void = () => {}) {
  const world = itemsWorld(BANK_ME);
  world.put(255, 25, { count: 20, entry: 2589, guid: BANK_CLOTH });
  bankCoinage(world, 100_000);
  seed(world);
  const rig = bankRig(world);
  rig.touch();
  return { rig, world };
}
