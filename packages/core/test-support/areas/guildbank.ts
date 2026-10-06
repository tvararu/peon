import { areaRig } from "#test-support/area-rig";
import type { AreaHandle } from "#wow/areas/compose";
import type { SentPacket } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import type { OpcodeDispatch } from "#wow/protocol/world";
import type { SessionStores } from "#wow/session-stores";
import type { WorldEvents } from "#wow/world-events";

export const GUILD_BANK_SELF = 0x00_00_00_00_00_00_00_0bn;
export const GUILD_BANK_VAULT = 0xf1_20_00_00_00_00_0c_01n;

export type GuildBankRig = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<"guildbank">;
  sent: readonly SentPacket[];
  events: WorldEvents;
  inject: (opcode: number, body: Uint8Array) => void;
  dispose: () => void;
};

function here() {
  return { mapId: 1, orientation: 0, x: 1600, y: 240, z: -50 };
}

export function guildbankVault(): Entity {
  return {
    bytes1: 34 << 8,
    displayId: 7606,
    entry: 187_290,
    factionTemplate: 0,
    gameObjectType: 34,
    guid: GUILD_BANK_VAULT,
    name: "Guild Vault",
    objectType: ObjectType.GAMEOBJECT,
    position: here(),
    rawFields: new Map(),
    scale: 1,
  } as Entity;
}

export function guildbankSelf(): Entity {
  return {
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    guid: GUILD_BANK_SELF,
    health: 100,
    level: 10,
    maxHealth: 100,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position: here(),
    rawFields: new Map(),
    scale: 1,
    target: 0n,
  } as Entity;
}

export function guildbankRig(): GuildBankRig {
  const vault = guildbankVault();
  const self = guildbankSelf();
  const rig = areaRig("guildbank", {
    getEntity: (guid) => {
      if (guid === GUILD_BANK_SELF) return self;
      if (guid === GUILD_BANK_VAULT) return vault;
    },
    selfGuid: GUILD_BANK_SELF,
  });
  return { ...rig };
}

type BankItemInit = {
  slot: number;
  entry: number;
  count?: number;
  charges?: number;
  enchant?: number;
  flags?: number;
  randomProperty?: number;
  randomSeed?: number;
  sockets?: readonly { index: number; enchant: number }[];
};

function writeBankItem(w: PacketWriter, item: BankItemInit): void {
  w.uint8(item.slot);
  w.uint32LE(item.entry);
  if (item.entry === 0) return;
  w.uint32LE((item.flags ?? 0) >>> 0);
  w.uint32LE((item.randomProperty ?? 0) >>> 0);
  if ((item.randomProperty ?? 0) !== 0)
    w.uint32LE((item.randomSeed ?? 0) >>> 0);
  w.uint32LE((item.count ?? 1) >>> 0);
  w.uint32LE((item.enchant ?? 0) >>> 0);
  w.uint8(item.charges ?? 0);
  const sockets = item.sockets ?? [];
  w.uint8(sockets.length);
  for (const socket of sockets) {
    w.uint8(socket.index);
    w.uint32LE(socket.enchant >>> 0);
  }
}

export function bankListBody(init: {
  money?: bigint;
  tab?: number;
  withdrawals?: number;
  full?: boolean;
  tabs?: readonly { name: string; icon: string }[];
  items?: readonly BankItemInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.money ?? 0n);
  w.uint8(init.tab ?? 0);
  w.uint32LE((init.withdrawals ?? -1) >>> 0);
  w.uint8(init.full === false ? 0 : 1);
  const tabs = init.full === false ? [] : (init.tabs ?? []);
  if ((init.tab ?? 0) === 0 && init.full !== false) {
    w.uint8(tabs.length);
    for (const tab of tabs) {
      w.cString(tab.name);
      w.cString(tab.icon);
    }
  }
  const items = init.items ?? [];
  w.uint8(items.length);
  for (const item of items) writeBankItem(w, item);
  return w.finish();
}

export function bankLogBody(init: {
  tab: number;
  entries: readonly (
    | {
        type: number;
        player?: bigint;
        entry: number;
        count?: number;
        age?: number;
      }
    | {
        type: number;
        player?: bigint;
        entry: number;
        count?: number;
        otherTab: number;
        age?: number;
      }
    | { type: number; player?: bigint; money: number; age?: number }
  )[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.tab);
  w.uint8(init.entries.length);
  for (const entry of init.entries) {
    w.uint8(entry.type);
    w.uint64LE(entry.player ?? 1n);
    if ("entry" in entry && !("otherTab" in entry)) {
      w.uint32LE(entry.entry);
      w.uint32LE(entry.count ?? 1);
    } else if ("otherTab" in entry) {
      w.uint32LE(entry.entry);
      w.uint32LE(entry.count ?? 1);
      w.uint8(entry.otherTab);
    } else {
      w.uint32LE(entry.money);
    }
    w.uint32LE(entry.age ?? 60);
  }
  return w.finish();
}

export function bankTextBody(tab: number, text: string): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tab);
  w.cString(text);
  return w.finish();
}

export function moneyWithdrawnBody(remaining: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(remaining >>> 0);
  return w.finish();
}
