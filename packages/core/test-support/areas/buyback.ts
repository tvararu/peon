import { type ItemsWorld, itemsWorld } from "#test-support/areas/items-world";
import { testStores } from "#test-support/session-fixtures";
import {
  type AreaHandle,
  type AreaRuntimes,
  type AreaStores,
  areaHandles,
  createModuleRuntimes,
  looseModule,
  registerModules,
} from "#wow/areas/compose";
import { type SentPacket, testPort } from "#wow/areas/port";
import { AREAS } from "#wow/areas/registry";
import {
  registerLootHandlers,
  registerVendorHandlers,
} from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import { OpcodeDispatch } from "#wow/protocol/world";
import { disposeSessionStores, type SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";
import type { WorldEvents } from "#wow/world-events";

type BuyFailedInit = {
  vendor: bigint;
  itemId: number;
  param?: number;
  result: number;
};

export function buybackBuyFailedBody(init: BuyFailedInit): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.vendor);
  w.uint32LE(init.itemId);
  if (init.param) w.uint32LE(init.param);
  w.uint8(init.result);
  return w.finish();
}

type SellItemInit = {
  vendor: bigint;
  itemGuid: bigint;
  param?: number;
  result: number;
};

export function buybackSellItemBody(init: SellItemInit): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.vendor);
  w.uint64LE(init.itemGuid);
  if (init.param) w.uint32LE(init.param);
  w.uint8(init.result);
  return w.finish();
}

type BuyItemInit = {
  vendor: bigint;
  vendorSlot: number;
  stock?: number;
  count: number;
};

export function buybackBuyItemBody(init: BuyItemInit): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.vendor);
  w.uint32LE(init.vendorSlot);
  w.uint32LE(init.stock ?? 0xff_ff_ff_ff);
  w.uint32LE(init.count);
  return w.finish();
}

export function buybackConn(dispatch: OpcodeDispatch): WorldConn {
  return { dispatch } as unknown as WorldConn;
}

const playerFields = (world: ItemsWorld) =>
  world.player.rawFields as Map<number, number>;
const low = (guid: bigint) => Number(guid & 0xff_ff_ff_ffn);
const high = (guid: bigint) => Number(guid >> 32n);

export function buybackSell(
  world: ItemsWorld,
  sale: { slot: number; guid: bigint; price: number; soldAt?: number },
): void {
  const fields = playerFields(world);
  const offset = PLAYER_FIELDS.FIELD_INV.offset + sale.slot * 2;
  fields.set(offset, low(sale.guid));
  fields.set(offset + 1, high(sale.guid));
  const index = sale.slot - 74;
  fields.set(PLAYER_FIELDS.BUYBACK_PRICE_1.offset + index, sale.price);
  fields.set(
    PLAYER_FIELDS.BUYBACK_TIMESTAMP_1.offset + index,
    sale.soldAt ?? 108_000,
  );
}

export function buybackCoinage(world: ItemsWorld, coinage: number): void {
  playerFields(world).set(PLAYER_FIELDS.COINAGE.offset, coinage);
}

export type BuybackRig = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<"buyback">;
  sent: readonly SentPacket[];
  events: WorldEvents;
  inject: (opcode: number, body: Uint8Array) => void;
  touch: () => void;
  dispose: () => void;
};

export function buybackRig(
  world: ItemsWorld,
  register?: (dispatch: OpcodeDispatch, stores: SessionStores) => void,
): BuybackRig {
  const module = looseModule(AREAS.buyback);
  const dispatch = new OpcodeDispatch();
  const self = world.player.guid;
  const port = testPort({
    expect: (opcode, options) => dispatch.expect(opcode, options),
    selfGuid: () => self,
  });
  const events = port.events();
  const stores = testStores({
    getEntity: world.lookup,
    selfGuid: port.selfGuid,
    send: port.send,
  });
  register?.(dispatch, stores);
  for (const use of module.opcodes.uses)
    if (!dispatch.has(GameOpcode[use]))
      dispatch.on(GameOpcode[use], () => undefined);
  const own = { buyback: stores.areas.buyback };
  registerModules(dispatch, [module], own);
  const lifetime = createModuleRuntimes(port, [module], own, stores);
  const handles = areaHandles(
    own as unknown as AreaStores,
    lifetime.runtimes as AreaRuntimes,
    () => events.area,
  );
  return {
    dispatch,
    dispose() {
      lifetime.dispose();
      disposeSessionStores(stores);
    },
    events,
    handle: handles.buyback,
    inject: (opcode, body) =>
      void dispatch.handle(opcode, new PacketReader(body)),
    sent: port.sent,
    stores,
    touch: () =>
      events.entity.emit({ changed: [], entity: world.player, type: "update" }),
  };
}

export const BUYBACK_ME = 0x0a_00n;
export const BUYBACK_VENDOR = 0xf1_30_00_00_00_00_00_42n;
export const BUYBACK_SWORD = 0x40_00_00_00_00_00_00_01n;
export const BUYBACK_BREAD = 0x40_00_00_00_00_00_00_07n;
export const BUYBACK_BAG = 0x40_00_00_00_00_00_00_0bn;
export const BREAD_ENTRY = 4540;
export const WATER_ENTRY = 159;

export function buybackScene(seed: (world: ItemsWorld) => void = () => {}) {
  const world = itemsWorld(BUYBACK_ME);
  world.put(255, 23, { entry: 25, guid: BUYBACK_SWORD });
  world.put(255, 25, { count: 2, entry: BREAD_ENTRY, guid: BUYBACK_BREAD });
  buybackCoinage(world, 1000);
  seed(world);
  const rig = buybackRig(world, (dispatch, stores) => {
    const conn = buybackConn(dispatch);
    registerVendorHandlers(conn, stores);
    registerLootHandlers(conn, stores);
  });
  rig.touch();
  return { rig, world };
}

export function buybackSellBread(
  { rig, world }: { rig: BuybackRig; world: ItemsWorld },
  price = 8,
): void {
  world.clear(255, 25);
  world.entities.delete(BUYBACK_BREAD);
  buybackSell(world, { guid: BUYBACK_BREAD, price, slot: 74 });
  buybackCoinage(world, 1000 + price);
  rig.touch();
}

export function buybackOpenVendor(rig: BuybackRig): void {
  rig.stores.vendor.receiveInventory({
    emptyReason: undefined,
    guid: BUYBACK_VENDOR,
    items: [
      {
        buyCount: 1,
        displayId: 0,
        extendedCost: 0,
        itemId: WATER_ENTRY,
        maxDurability: 0,
        price: 25,
        slot: 1,
        stock: null,
      },
    ],
  });
}

export function buybackClear(world: ItemsWorld, slot: number): void {
  buybackSell(world, { guid: 0n, price: 0, slot, soldAt: 0 });
}
