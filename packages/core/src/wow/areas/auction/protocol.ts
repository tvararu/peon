import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const AUCTION_LIST_ROW_BYTES = 148;
export const AUCTION_SORT_MAX = 11;
export const AUCTION_BIDDER_LIST_LIMIT = 1000;

export type AuctionHello = {
  auctioneer: bigint;
  houseId: number;
  enabled: boolean;
};

export type AuctionEnchants = readonly (readonly [number, number, number])[];

export type AuctionRow = {
  id: number;
  entry: number;
  enchants: AuctionEnchants;
  randomProperty: number;
  suffixFactor: number;
  count: number;
  spellCharges: number;
  owner: bigint;
  startBid: number;
  minOutbid: number;
  buyout: number;
  timeLeftMs: number;
  bidder: bigint;
  bid: number;
};

export type AuctionList = {
  rows: readonly AuctionRow[];
  total: number;
  searchDelayMs: number;
};

export type AuctionSort = {
  mode: number;
  isDesc: boolean;
};

export type AuctionQuery = {
  npc: bigint;
  itemClassFilter: number;
  from: number;
} & Partial<{
  sort: readonly AuctionSort[];
  name: string;
  levelMin: number;
  levelMax: number;
  inventoryType: number;
  itemSubClass: number;
  quality: number;
  usable: boolean;
}>;

function byte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new Error(`${label} ${value} is not one byte`);
  return value;
}

function word(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff)
    throw new Error(`${label} ${value} is not one word`);
  return value;
}

export function buildAuctionHello(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

function writeQuerySort(w: PacketWriter, sort: readonly AuctionSort[]): void {
  w.uint8(byte(sort.length, "sortCount"));
  for (const entry of sort) {
    w.uint8(byte(entry.mode, "sortMode"));
    w.uint8(entry.isDesc ? 1 : 0);
  }
}

export function buildAuctionListItems(query: AuctionQuery): Uint8Array {
  const sort = query.sort ?? [];
  if (sort.length > AUCTION_SORT_MAX)
    throw new Error(`sortCount ${sort.length} exceeds ${AUCTION_SORT_MAX}`);
  const w = new PacketWriter();
  w.uint64LE(query.npc);
  w.uint32LE(word(query.from, "listfrom"));
  w.cString(query.name ?? "");
  w.uint8(byte(query.levelMin ?? 0, "levelmin"));
  w.uint8(byte(query.levelMax ?? 0, "levelmax"));
  w.uint32LE(word(query.inventoryType ?? 0xff_ff_ff_ff, "inventoryType"));
  w.uint32LE(word(query.itemClassFilter, "itemClass"));
  w.uint32LE(word(query.itemSubClass ?? 0xff_ff_ff_ff, "itemSubClass"));
  w.uint32LE(word(query.quality ?? 0xff_ff_ff_ff, "quality"));
  w.uint8(query.usable === true ? 1 : 0);
  w.uint8(0);
  writeQuerySort(w, sort);
  return w.finish();
}

export function buildAuctionListOwnerItems(
  npc: bigint,
  from: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(word(from, "listfrom"));
  return w.finish();
}

export function buildAuctionListBidderItems(
  npc: bigint,
  from: number,
  outbidIds: readonly number[],
): Uint8Array {
  if (outbidIds.length > AUCTION_BIDDER_LIST_LIMIT)
    throw new Error(
      `outbid ids ${outbidIds.length} exceed ${AUCTION_BIDDER_LIST_LIMIT}`,
    );
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(word(from, "listfrom"));
  w.uint32LE(word(outbidIds.length, "outbidCount"));
  for (const id of outbidIds) w.uint32LE(word(id, "outbidId"));
  return w.finish();
}

export function parseAuctionHello(reader: PacketReader): AuctionHello {
  const auctioneer = reader.uint64LE();
  const houseId = reader.uint32LE();
  return { auctioneer, enabled: reader.uint8() !== 0, houseId };
}

function parseRow(reader: PacketReader): AuctionRow {
  const id = reader.uint32LE();
  const entry = reader.uint32LE();
  const enchants: [number, number, number][] = [];
  for (let slot = 0; slot < 7; slot++)
    enchants.push([reader.uint32LE(), reader.uint32LE(), reader.uint32LE()]);
  const randomProperty = reader.int32LE();
  const suffixFactor = reader.uint32LE();
  const count = reader.uint32LE();
  const spellCharges = reader.uint32LE();
  reader.uint32LE();
  const owner = reader.uint64LE();
  const startBid = reader.uint32LE();
  const minOutbid = reader.uint32LE();
  const buyout = reader.uint32LE();
  const timeLeftMs = reader.uint32LE();
  const bidder = reader.uint64LE();
  const bid = reader.uint32LE();
  return {
    bid,
    bidder,
    buyout,
    count,
    enchants,
    entry,
    id,
    minOutbid,
    owner,
    randomProperty,
    spellCharges,
    startBid,
    suffixFactor,
    timeLeftMs,
  };
}

export function parseAuctionList(reader: PacketReader): AuctionList {
  const count = reader.uint32LE();
  if (reader.remaining !== count * AUCTION_LIST_ROW_BYTES + 8)
    throw new Error("auction list length does not fit the count");
  const rows: AuctionRow[] = [];
  for (let index = 0; index < count; index++) rows.push(parseRow(reader));
  const total = reader.uint32LE();
  const searchDelayMs = reader.uint32LE();
  return { rows, searchDelayMs, total };
}

export const MAX_MONEY_AMOUNT = 0x7f_ff_ff_fe;

export type AuctionSaleLine = {
  guid: bigint;
  count: number;
};

export type AuctionAction = 0 | 1 | 2;

export type AuctionCommandResult = {
  auctionId: number;
  action: AuctionAction;
  error: number;
  bidError?: number | undefined;
};

export type AuctionBidderNotice = {
  houseId: number;
  auctionId: number;
  bidder: bigint;
  bidSum: number;
  diff: number;
  itemEntry: number;
};

export type AuctionOwnerNotice = {
  auctionId: number;
  bid: number;
  itemEntry: number;
};

const ACTION_NAMES: Record<number, AuctionAction> = { 0: 0, 1: 1, 2: 2 };

export type AuctionSale = {
  items: readonly AuctionSaleLine[];
  bid: number;
  buyout: number;
  minutes: number;
};

export function buildAuctionSellItem(
  npc: bigint,
  sale: AuctionSale,
): Uint8Array {
  if (sale.items.length === 0 || sale.items.length > 160)
    throw new Error(`sell items ${sale.items.length} out of 1-160`);
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(word(sale.items.length, "itemsCount"));
  for (const item of sale.items) {
    w.uint64LE(item.guid);
    w.uint32LE(word(item.count, "itemCount"));
  }
  w.uint32LE(word(sale.bid, "bid"));
  w.uint32LE(word(sale.buyout, "buyout"));
  w.uint32LE(word(sale.minutes, "minutes"));
  return w.finish();
}

export function buildAuctionRemoveItem(npc: bigint, id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(word(id, "auctionId"));
  return w.finish();
}

export function buildAuctionPlaceBid(
  npc: bigint,
  id: number,
  price: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(word(id, "auctionId"));
  w.uint32LE(word(price, "price"));
  return w.finish();
}

export function buildAuctionListPendingSales(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function parseAuctionCommandResult(
  reader: PacketReader,
): AuctionCommandResult {
  const auctionId = reader.uint32LE();
  const actionRaw = reader.uint32LE();
  const error = reader.uint32LE();
  const action = ACTION_NAMES[actionRaw] ?? 0;
  if (error !== 0 || action === 0) return { action, auctionId, error };
  return { action, auctionId, bidError: reader.uint32LE(), error };
}

export function parseAuctionBidderNotice(
  reader: PacketReader,
): AuctionBidderNotice {
  const houseId = reader.uint32LE();
  const auctionId = reader.uint32LE();
  const bidder = reader.uint64LE();
  const bidSum = reader.uint32LE();
  const diff = reader.uint32LE();
  const itemEntry = reader.uint32LE();
  reader.uint32LE();
  return { auctionId, bidder, bidSum, diff, houseId, itemEntry };
}

export function parseAuctionOwnerNotice(
  reader: PacketReader,
): AuctionOwnerNotice {
  const auctionId = reader.uint32LE();
  const bid = reader.uint32LE();
  reader.uint32LE();
  reader.uint64LE();
  const itemEntry = reader.uint32LE();
  reader.uint32LE();
  reader.floatLE();
  return { auctionId, bid, itemEntry };
}

export function parseAuctionPendingSales(reader: PacketReader): {
  count: number;
} {
  return { count: reader.uint32LE() };
}
