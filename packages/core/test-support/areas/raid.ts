import { PacketWriter } from "#wow/protocol/packet";

const GROUP_TYPE_LFG = 0x08;
const RAID_DIFFICULTY_10MAN_HEROIC = 2;

export type RaidListMember = {
  name: string;
  guid: bigint;
  status?: number;
  subgroup?: number;
  flags?: number;
  roles?: number;
};

export type RaidListLoot = {
  method: number;
  master?: bigint;
  threshold: number;
  dungeonDifficulty?: number;
  raidDifficulty?: number;
};

export type RaidListInit = {
  type: number;
  subgroup?: number;
  flags?: number;
  roles?: number;
  dungeonFinder?: { status: number; dungeonId: number };
  groupGuid?: bigint;
  counter?: number;
  members: readonly RaidListMember[];
  leader: bigint;
  loot?: RaidListLoot;
};

export const RAID_GROUP_GUID = 0x1f4n;

function writeHead(w: PacketWriter, init: RaidListInit): void {
  w.uint8(init.type);
  w.uint8(init.subgroup ?? 0);
  w.uint8(init.flags ?? 0);
  w.uint8(init.roles ?? 0);
  if ((init.type & GROUP_TYPE_LFG) !== 0) {
    w.uint8(init.dungeonFinder?.status ?? 0);
    w.uint32LE(init.dungeonFinder?.dungeonId ?? 0);
  }
  w.uint64LE(init.groupGuid ?? RAID_GROUP_GUID);
  w.uint32LE(init.counter ?? 0);
}

function writeMembers(w: PacketWriter, init: RaidListInit): void {
  w.uint32LE(init.members.length);
  for (const member of init.members) {
    w.cString(member.name);
    w.uint64LE(member.guid);
    w.uint8(member.status ?? 1);
    w.uint8(member.subgroup ?? 0);
    w.uint8(member.flags ?? 0);
    w.uint8(member.roles ?? 0);
  }
}

function writeLoot(w: PacketWriter, init: RaidListInit): void {
  if (init.members.length === 0) return;
  const loot = init.loot ?? { method: 1, threshold: 2 };
  const raidDifficulty = loot.raidDifficulty ?? 0;
  w.uint8(loot.method);
  w.uint64LE(loot.method === 2 ? (loot.master ?? 0n) : 0n);
  w.uint8(loot.threshold);
  w.uint8(loot.dungeonDifficulty ?? 0);
  w.uint8(raidDifficulty);
  w.uint8(raidDifficulty >= RAID_DIFFICULTY_10MAN_HEROIC ? 1 : 0);
}

export function raidGroupListBody(init: RaidListInit): Uint8Array {
  const w = new PacketWriter();
  writeHead(w, init);
  writeMembers(w, init);
  w.uint64LE(init.leader);
  writeLoot(w, init);
  return w.finish();
}

export function raidGroupLeftBody(counter = 0): Uint8Array {
  const w = new PacketWriter();
  for (const byte of [0x10, 0, 0, 0]) w.uint8(byte);
  w.uint64LE(RAID_GROUP_GUID);
  w.uint32LE(counter);
  w.uint32LE(0);
  w.uint64LE(0n);
  return w.finish();
}

export function raidGroupInviteBody(init: {
  status: number;
  name: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.status);
  w.cString(init.name);
  w.uint32LE(0);
  w.uint8(0);
  w.uint32LE(0);
  return w.finish();
}
