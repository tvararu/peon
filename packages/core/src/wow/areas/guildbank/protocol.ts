import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const GUILD_BANK_MAX_TABS = 6;
export const GUILD_BANK_MAX_SLOTS = 98;
export const GUILD_BANK_MONEY_LOG_TAB = 6;

export const GUILD_BANK_LOG = {
  DEPOSIT_ITEM: 1,
  WITHDRAW_ITEM: 2,
  MOVE_ITEM: 3,
  DEPOSIT_MONEY: 4,
  WITHDRAW_MONEY: 5,
  REPAIR_MONEY: 6,
  MOVE_ITEM2: 7,
  UNK1: 8,
  BUY_SLOT: 9,
} as const;

const LOG_NAMES: Record<number, string> = {
  [GUILD_BANK_LOG.DEPOSIT_ITEM]: "deposit_item",
  [GUILD_BANK_LOG.WITHDRAW_ITEM]: "withdraw_item",
  [GUILD_BANK_LOG.MOVE_ITEM]: "move_item",
  [GUILD_BANK_LOG.DEPOSIT_MONEY]: "deposit_money",
  [GUILD_BANK_LOG.WITHDRAW_MONEY]: "withdraw_money",
  [GUILD_BANK_LOG.REPAIR_MONEY]: "repair_money",
  [GUILD_BANK_LOG.MOVE_ITEM2]: "move_item2",
  [GUILD_BANK_LOG.UNK1]: "unk1",
  [GUILD_BANK_LOG.BUY_SLOT]: "buy_slot",
};

export function guildBankLogName(type: number): string {
  return LOG_NAMES[type] ?? `bank_log_${type}`;
}

function byte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new Error(`${label} ${value} is not one byte`);
  return value;
}

function tab(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > GUILD_BANK_MAX_TABS)
    throw new Error(`${label} ${value} is not a bank tab`);
  return value;
}

export function buildBankerActivate(vault: bigint, full: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(full ? 1 : 0);
  return w.finish();
}

export function buildBankQueryTab(
  vault: bigint,
  tabId: number,
  full: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(tab(tabId, "tab"));
  w.uint8(full ? 1 : 0);
  return w.finish();
}

export type BankOnlySwap = {
  kind: "bank_only";
  srcTab: number;
  srcSlot: number;
  destTab: number;
  destSlot: number;
  entry: number;
  count: number;
};

export type InventorySwap = {
  kind: "inventory";
  tabId: number;
  slot: number;
  entry: number;
  autoStore: boolean;
  bag?: number;
  bagSlot?: number;
  toChar?: boolean;
  count?: number;
};

export function buildBankOnlySwap(
  vault: bigint,
  swap: Omit<BankOnlySwap, "kind">,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(1);
  w.uint8(tab(swap.destTab, "destTab"));
  w.uint8(byte(swap.destSlot, "destSlot"));
  w.uint32LE(swap.entry);
  w.uint8(tab(swap.srcTab, "srcTab"));
  w.uint8(byte(swap.srcSlot, "srcSlot"));
  w.uint32LE(0);
  w.uint8(0);
  w.uint32LE(swap.count);
  return w.finish();
}

export function buildInventorySwap(
  vault: bigint,
  swap: Omit<InventorySwap, "kind">,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(0);
  w.uint8(tab(swap.tabId, "tab"));
  w.uint8(byte(swap.slot, "slot"));
  w.uint32LE(swap.entry);
  w.uint8(swap.autoStore ? 1 : 0);
  if (swap.autoStore) {
    w.uint32LE(swap.count ?? 0);
    w.uint8(swap.toChar === false ? 0 : 1);
    w.uint32LE(0);
    return w.finish();
  }
  w.uint8(byte(swap.bag ?? 255, "bag"));
  w.uint8(byte(swap.bagSlot ?? 255, "bagSlot"));
  w.uint8(swap.toChar === false ? 0 : 1);
  w.uint32LE(swap.count ?? 0);
  return w.finish();
}

export function buildBuyBankTab(vault: bigint, tabId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(tab(tabId, "tab"));
  return w.finish();
}

export function buildUpdateBankTab(
  vault: bigint,
  tabId: number,
  name: string,
  icon: string,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint8(tab(tabId, "tab"));
  w.cString(name);
  w.cString(icon);
  return w.finish();
}

export function buildDepositBankMoney(
  vault: bigint,
  copper: number,
): Uint8Array {
  if (!Number.isInteger(copper) || copper < 0 || copper > 0xff_ff_ff_ff)
    throw new Error(`copper ${copper} is not a u32`);
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint32LE(copper);
  return w.finish();
}

export function buildWithdrawBankMoney(
  vault: bigint,
  copper: number,
): Uint8Array {
  if (!Number.isInteger(copper) || copper < 0 || copper > 0xff_ff_ff_ff)
    throw new Error(`copper ${copper} is not a u32`);
  const w = new PacketWriter();
  w.uint64LE(vault);
  w.uint32LE(copper);
  return w.finish();
}

export function buildBankLogQuery(tabId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tab(tabId, "tab"));
  return w.finish();
}

export function buildBankTextQuery(tabId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tab(tabId, "tab"));
  return w.finish();
}

export function buildSetBankText(tabId: number, text: string): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tab(tabId, "tab"));
  w.cString(text);
  return w.finish();
}

export type GuildBankSocket = { index: number; enchant: number };

export type GuildBankSlot = {
  slot: number;
  entry: number;
  count: number;
  charges: number;
  enchant: number;
  flags: number;
  randomProperty: number;
  randomSeed: number;
  sockets: readonly GuildBankSocket[];
};

export type GuildBankTabBrief = { name: string; icon: string };

export type GuildBankList = {
  money: bigint;
  tab: number;
  withdrawals: number;
  full: boolean;
  tabs: readonly GuildBankTabBrief[];
  items: readonly GuildBankSlot[];
};

function readSlot(reader: PacketReader): GuildBankSlot | undefined {
  if (reader.remaining < 5) return undefined;
  const slot = reader.uint8();
  const entry = reader.uint32LE();
  if (entry === 0) {
    return {
      charges: 0,
      count: 0,
      enchant: 0,
      entry: 0,
      flags: 0,
      randomProperty: 0,
      randomSeed: 0,
      slot,
      sockets: [],
    };
  }
  if (reader.remaining < 18) return undefined;
  const flags = reader.int32LE();
  const randomProperty = reader.int32LE();
  const randomSeed = randomProperty === 0 ? 0 : reader.int32LE();
  if (randomProperty !== 0 && reader.remaining < 14) return undefined;
  if (randomProperty === 0 && reader.remaining < 10) return undefined;
  const count = reader.int32LE();
  const enchant = reader.int32LE();
  const charges = reader.uint8();
  const socketCount = reader.uint8();
  if (reader.remaining < socketCount * 5) return undefined;
  const sockets: GuildBankSocket[] = [];
  for (let i = 0; i < socketCount; i++) {
    const index = reader.uint8();
    sockets.push({ enchant: reader.int32LE(), index });
  }
  return {
    charges,
    count,
    enchant,
    entry,
    flags,
    randomProperty,
    randomSeed,
    slot,
    sockets,
  };
}

function readBriefs(reader: PacketReader): GuildBankTabBrief[] | undefined {
  if (reader.remaining < 1) return undefined;
  const count = reader.uint8();
  const tabs: GuildBankTabBrief[] = [];
  for (let i = 0; i < count; i++) {
    if (reader.remaining < 2) return undefined;
    const name = reader.cString();
    const icon = reader.cString();
    tabs.push({ icon, name });
  }
  return tabs;
}

export function parseBankList(reader: PacketReader): GuildBankList | undefined {
  if (reader.remaining < 14) return undefined;
  const money = reader.uint64LE();
  const tabId = reader.uint8();
  const withdrawals = reader.int32LE();
  const full = reader.uint8() !== 0;
  const tabs = tabId === 0 && full ? readBriefs(reader) : [];
  if (!tabs || reader.remaining < 1) return undefined;
  const slots = reader.uint8();
  const items: GuildBankSlot[] = [];
  for (let i = 0; i < slots; i++) {
    const item = readSlot(reader);
    if (!item) return undefined;
    items.push(item);
  }
  return { full, items, money, tab: tabId, tabs, withdrawals };
}

export type GuildBankLogEntry =
  | {
      kind: "item";
      type: number;
      name: string;
      player: bigint;
      entry: number;
      count: number;
      age: number;
    }
  | {
      kind: "move";
      type: number;
      name: string;
      player: bigint;
      entry: number;
      count: number;
      otherTab: number;
      age: number;
    }
  | {
      kind: "money";
      type: number;
      name: string;
      player: bigint;
      money: number;
      age: number;
    };

export type GuildBankLog = {
  tab: number;
  entries: readonly GuildBankLogEntry[];
};

function readLogEntry(reader: PacketReader): GuildBankLogEntry | undefined {
  if (reader.remaining < 9) return undefined;
  const type = reader.uint8();
  const player = reader.uint64LE();
  const name = guildBankLogName(type);
  if (
    type === GUILD_BANK_LOG.DEPOSIT_ITEM ||
    type === GUILD_BANK_LOG.WITHDRAW_ITEM
  ) {
    if (reader.remaining < 12) return undefined;
    const entry = reader.uint32LE();
    const count = reader.uint32LE();
    const age = reader.uint32LE();
    return { age, count, entry, kind: "item", name, player, type };
  }
  if (type === GUILD_BANK_LOG.MOVE_ITEM || type === GUILD_BANK_LOG.MOVE_ITEM2) {
    if (reader.remaining < 13) return undefined;
    const entry = reader.uint32LE();
    const count = reader.uint32LE();
    const otherTab = reader.uint8();
    const age = reader.uint32LE();
    return { age, count, entry, kind: "move", name, otherTab, player, type };
  }
  if (reader.remaining < 8) return undefined;
  const money = reader.uint32LE();
  const age = reader.uint32LE();
  return { age, kind: "money", money, name, player, type };
}

export function parseBankLog(reader: PacketReader): GuildBankLog | undefined {
  if (reader.remaining < 2) return undefined;
  const tabId = reader.uint8();
  const count = reader.uint8();
  const entries: GuildBankLogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entry = readLogEntry(reader);
    if (!entry) return undefined;
    entries.push(entry);
  }
  return { entries, tab: tabId };
}

export type GuildBankText = { tab: number; text: string };

export function parseBankText(reader: PacketReader): GuildBankText | undefined {
  if (reader.remaining < 2) return undefined;
  const tabId = reader.uint8();
  return { tab: tabId, text: reader.cString() };
}

export function parseMoneyWithdrawn(reader: PacketReader): number | undefined {
  if (reader.remaining < 4) return undefined;
  return reader.int32LE();
}
