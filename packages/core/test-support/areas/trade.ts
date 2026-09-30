import { areaRig } from "#test-support/area-rig";
import { type ItemsWorld, itemsWorld } from "#test-support/areas/items-world";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export const TRADE_STATUS = {
  BEGIN_TRADE: 1,
  BUSY: 0,
  CLOSE_WINDOW: 12,
  IGNORE_YOU: 14,
  NO_TARGET: 6,
  OPEN_WINDOW: 2,
  TARGET_DEAD: 18,
  TARGET_LOGOUT: 20,
  TARGET_STUNNED: 16,
  TARGET_TO_FAR: 10,
  TRADE_CANCELED: 3,
  TRIAL_ACCOUNT: 21,
  WRONG_FACTION: 11,
  WRONG_REALM: 22,
  YOU_DEAD: 17,
  YOU_LOGOUT: 19,
  YOU_STUNNED: 15,
} as const;

export const TRADE_PARTNER = 0x00_00_00_00_00_00_0b_01n;
export const TRADE_SELF = 0x00_00_00_00_00_00_0a_01n;
export const TRADE_LINEN = 0x40_00_00_00_00_00_0c_01n;
export const TRADE_SWORD = 0x40_00_00_00_00_00_0c_02n;

export type TradeStatusExtra = {
  trader?: bigint;
  tradeId?: number;
  result?: number;
  isTarget?: boolean;
  limitItem?: number;
  slot?: number;
};

export function tradeStatusBody(
  status: number,
  extra: TradeStatusExtra = {},
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(status);
  if (status === TRADE_STATUS.BEGIN_TRADE) w.uint64LE(extra.trader ?? 0n);
  else if (status === TRADE_STATUS.OPEN_WINDOW) w.uint32LE(extra.tradeId ?? 0);
  else if (status === TRADE_STATUS.CLOSE_WINDOW) {
    w.uint32LE(extra.result ?? 0);
    w.uint8(extra.isTarget ? 1 : 0);
    w.uint32LE(extra.limitItem ?? 0);
  } else if (status === 22 || status === 23) w.uint8(extra.slot ?? 0);
  return w.finish();
}

export function tradeRig() {
  return areaRig("trade", { selfGuid: TRADE_SELF });
}

export function tradeCoinage(world: ItemsWorld, coinage: number): void {
  (world.player.rawFields as Map<number, number>).set(
    PLAYER_FIELDS.COINAGE.offset,
    coinage,
  );
}

export function tradeScene(seed: (world: ItemsWorld) => void = () => {}) {
  const world = itemsWorld(TRADE_SELF);
  world.put(255, 24, { count: 3, entry: 2589, guid: TRADE_LINEN });
  tradeCoinage(world, 1000);
  seed(world);
  const rig = areaRig("trade", {
    getEntity: world.lookup,
    selfGuid: TRADE_SELF,
  });
  const opened = () =>
    rig.inject(
      GameOpcode.SMSG_TRADE_STATUS,
      tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 1 }),
    );
  const touch = () =>
    rig.events.entity.emit({
      changed: [],
      entity: world.player,
      type: "update",
    });
  return { opened, rig, touch, world };
}

export type TradeExtendedItemInit = {
  entry: number;
  display?: number;
  count?: number;
  wrapped?: boolean;
  giftCreator?: bigint;
  permanentEnchant?: number;
  gemEnchants?: readonly [number, number, number];
  creator?: bigint;
  charges?: number;
  suffix?: number;
  randomProperty?: number;
  lock?: number;
  maxDurability?: number;
  durability?: number;
};

export type TradeExtendedInit = {
  side: number;
  gold?: number;
  spell?: number;
  slots?: Readonly<Record<number, TradeExtendedItemInit>>;
};

function writeExtendedSlot(
  w: PacketWriter,
  index: number,
  item?: TradeExtendedItemInit,
): void {
  w.uint8(index);
  if (!item) {
    for (let word = 0; word < 18; word++) w.uint32LE(0);
    return;
  }
  writeExtendedHead(w, item);
  writeExtendedTail(w, item);
}

function writeExtendedHead(w: PacketWriter, item: TradeExtendedItemInit): void {
  w.uint32LE(item.entry);
  w.uint32LE(item.display ?? 0);
  w.uint32LE(item.count ?? 1);
  w.uint32LE(item.wrapped ? 1 : 0);
  w.uint64LE(item.giftCreator ?? 0n);
  w.uint32LE(item.permanentEnchant ?? 0);
  for (const gem of item.gemEnchants ?? [0, 0, 0]) w.uint32LE(gem);
  w.uint64LE(item.creator ?? 0n);
}

function writeExtendedTail(w: PacketWriter, item: TradeExtendedItemInit): void {
  w.uint32LE(item.charges ?? 0);
  w.uint32LE(item.suffix ?? 0);
  w.uint32LE((item.randomProperty ?? 0) >>> 0);
  w.uint32LE(item.lock ?? 0);
  w.uint32LE(item.maxDurability ?? 0);
  w.uint32LE(item.durability ?? 0);
}

export function tradeStatusExtendedBody(init: TradeExtendedInit): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.side);
  w.uint32LE(0);
  w.uint32LE(7);
  w.uint32LE(7);
  w.uint32LE(init.gold ?? 0);
  w.uint32LE(init.spell ?? 0);
  for (let index = 0; index < 7; index++)
    writeExtendedSlot(w, index, init.slots?.[index]);
  return w.finish();
}
