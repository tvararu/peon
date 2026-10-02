import { areaRig } from "#test-support/area-rig";
import type { ItemsWorld } from "#test-support/areas/items-world";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";

export const AUCTION_SELF = 0x00_00_00_00_00_00_00_07n;
export const AUCTIONEER = 0xf1_30_00_40_f3_00_29_42n;
export const AUCTION_OWNER = 0x00_00_00_00_00_00_00_2an;
export const AUCTION_BIDDER = 0x00_00_00_00_00_00_00_2bn;
export const AUCTION_ROW_BYTES = 148;

export type AuctionRowInit = {
  id?: number;
  entry?: number;
  enchants?: readonly (readonly [number, number, number])[];
  randomProperty?: number;
  suffixFactor?: number;
  count?: number;
  spellCharges?: number;
  owner?: bigint;
  startBid?: number;
  minOutbid?: number;
  buyout?: number;
  timeLeftMs?: number;
  bidder?: bigint;
  bid?: number;
};

export function auctionHelloBody(init: {
  auctioneer?: bigint;
  house?: number;
  enabled?: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.auctioneer ?? AUCTIONEER);
  w.uint32LE(init.house ?? 6);
  w.uint8(init.enabled === false ? 0 : 1);
  return w.finish();
}

function writeRow(w: PacketWriter, row: AuctionRowInit): void {
  w.uint32LE(row.id ?? 0);
  w.uint32LE(row.entry ?? 0);
  for (let slot = 0; slot < 7; slot++) {
    const enchant = row.enchants?.[slot] ?? [0, 0, 0];
    w.uint32LE(enchant[0]);
    w.uint32LE(enchant[1]);
    w.uint32LE(enchant[2]);
  }
  w.uint32LE((row.randomProperty ?? 0) >>> 0);
  w.uint32LE(row.suffixFactor ?? 0);
  w.uint32LE(row.count ?? 1);
  w.uint32LE(row.spellCharges ?? 0);
  w.uint32LE(0);
  w.uint64LE(row.owner ?? AUCTION_OWNER);
  w.uint32LE(row.startBid ?? 0);
  w.uint32LE(row.minOutbid ?? 0);
  w.uint32LE(row.buyout ?? 0);
  w.uint32LE(row.timeLeftMs ?? 0);
  w.uint64LE(row.bidder ?? 0n);
  w.uint32LE(row.bid ?? 0);
}

export function auctionListBody(init: {
  rows?: readonly AuctionRowInit[];
  total?: number;
  delay?: number;
}): Uint8Array {
  const rows = init.rows ?? [];
  const w = new PacketWriter();
  w.uint32LE(rows.length);
  for (const row of rows) writeRow(w, row);
  w.uint32LE(init.total ?? rows.length);
  w.uint32LE(init.delay ?? 300);
  return w.finish();
}

export function auctionPlayer(position: {
  mapId: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
}): Entity {
  return {
    entry: 0,
    guid: AUCTION_SELF,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position,
    rawFields: new Map(),
    scale: 1,
  } as Entity;
}

export function auctionNpc(
  position: {
    mapId: number;
    x: number;
    y: number;
    z: number;
    orientation: number;
  },
  npcFlags = 0x20_00_00,
): Entity {
  return {
    entry: 16_627,
    guid: AUCTIONEER,
    name: "Ithillan",
    npcFlags,
    objectType: ObjectType.UNIT,
    position,
    rawFields: new Map(),
    scale: 1,
  } as Entity;
}

export function auctionCommandResultBody(init: {
  auctionId: number;
  action: number;
  error?: number;
  bidError?: number;
}): Uint8Array {
  const error = init.error ?? 0;
  const w = new PacketWriter();
  w.uint32LE(init.auctionId);
  w.uint32LE(init.action);
  w.uint32LE(error);
  if (error === 0 && init.action !== 0) w.uint32LE(init.bidError ?? 0);
  return w.finish();
}

export function auctionBidderNoticeBody(init: {
  houseId?: number;
  auctionId: number;
  bidder?: bigint;
  bidSum?: number;
  diff?: number;
  itemEntry?: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.houseId ?? 6);
  w.uint32LE(init.auctionId);
  w.uint64LE(init.bidder ?? AUCTION_SELF);
  w.uint32LE(init.bidSum ?? 0);
  w.uint32LE(init.diff ?? 0);
  w.uint32LE(init.itemEntry ?? 2589);
  w.uint32LE(0);
  return w.finish();
}

export function auctionOwnerNoticeBody(init: {
  auctionId: number;
  bid?: number;
  itemEntry?: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.auctionId);
  w.uint32LE(init.bid ?? 0);
  w.uint32LE(0);
  w.uint64LE(0n);
  w.uint32LE(init.itemEntry ?? 2589);
  w.uint32LE(0);
  w.floatLE(0);
  return w.finish();
}

export function auctionPendingSalesBody(count = 0): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(count);
  return w.finish();
}

export function auctionRig(
  options: { npcDistance?: number; npcFlags?: number; world?: ItemsWorld } = {},
) {
  const here = { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 };
  const self = options.world
    ? Object.assign(options.world.player, { position: here })
    : auctionPlayer(here);
  const npc = auctionNpc(
    {
      mapId: 530,
      orientation: 0,
      x: options.npcDistance ?? 3,
      y: 0,
      z: 0,
    },
    options.npcFlags,
  );
  return areaRig("auction", {
    getEntity: (guid) => {
      if (guid === AUCTION_SELF) return self;
      if (guid === AUCTIONEER) return npc;
      return options.world?.lookup(guid);
    },
    selfGuid: AUCTION_SELF,
  });
}
