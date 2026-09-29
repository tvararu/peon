import type { PacketReader } from "#wow/protocol/packet";

export const GROUP_LIST_LFG_TYPE = 0x08;
export const GROUP_LIST_LEFT_TYPE = 0x10;
const GROUP_LIST_ONLINE_STATUS = 0x01;
const MASTER_LOOT_METHOD = 2;

export type GroupListMember = {
  name: string;
  guidLow: number;
  guidHigh: number;
  status: number;
  subgroup: number;
  flags: number;
  roles: number;
  online: boolean;
};

export type GroupListLoot = {
  method: number;
  looterGuidLow: number;
  looterGuidHigh: number;
  threshold: number;
  dungeonDifficulty: number;
  raidDifficulty: number;
  heroic: boolean;
};

export type GroupList = {
  type: number;
  ownSubgroup: number;
  ownFlags: number;
  ownRoles: number;
  dungeonStatus: number | undefined;
  dungeonId: number | undefined;
  groupGuidLow: number;
  groupGuidHigh: number;
  counter: number;
  members: GroupListMember[];
  leaderGuidLow: number;
  leaderGuidHigh: number;
  loot: GroupListLoot | undefined;
};

export type GroupInviteReceived = {
  status: number;
  name: string;
};

export function parseGroupInvite(r: PacketReader): GroupInviteReceived {
  const status = r.uint8();
  const name = r.cString();
  r.uint32LE();
  r.uint8();
  r.uint32LE();
  return { name, status };
}

export function parseGroupList(r: PacketReader): GroupList {
  const type = r.uint8();
  const ownSubgroup = r.uint8();
  const ownFlags = r.uint8();
  const ownRoles = r.uint8();
  const dungeon = (type & GROUP_LIST_LFG_TYPE) !== 0;
  const dungeonStatus = dungeon ? r.uint8() : undefined;
  const dungeonId = dungeon ? r.uint32LE() : undefined;
  const groupGuidLow = r.uint32LE();
  const groupGuidHigh = r.uint32LE();
  const counter = r.uint32LE();
  const memberCount = r.uint32LE();
  const members: GroupListMember[] = [];
  for (let i = 0; i < memberCount; i++) {
    const name = r.cString();
    const guidLow = r.uint32LE();
    const guidHigh = r.uint32LE();
    const status = r.uint8();
    const subgroup = r.uint8();
    const flags = r.uint8();
    const roles = r.uint8();
    members.push({
      flags,
      guidHigh,
      guidLow,
      name,
      online: (status & GROUP_LIST_ONLINE_STATUS) !== 0,
      roles,
      status,
      subgroup,
    });
  }
  const leaderGuidLow = r.uint32LE();
  const leaderGuidHigh = r.uint32LE();
  const loot = memberCount > 0 && r.remaining >= 13 ? parseLoot(r) : undefined;
  return {
    counter,
    dungeonId,
    dungeonStatus,
    groupGuidHigh,
    groupGuidLow,
    leaderGuidHigh,
    leaderGuidLow,
    loot,
    members,
    ownFlags,
    ownRoles,
    ownSubgroup,
    type,
  };
}

function parseLoot(r: PacketReader): GroupListLoot {
  const method = r.uint8();
  const looterGuidLow = r.uint32LE();
  const looterGuidHigh = r.uint32LE();
  const threshold = r.uint8();
  const dungeonDifficulty = r.uint8();
  const raidDifficulty = r.uint8();
  const heroic = r.uint8() !== 0;
  if (method !== MASTER_LOOT_METHOD) {
    return {
      dungeonDifficulty,
      heroic,
      looterGuidHigh: 0,
      looterGuidLow: 0,
      method,
      raidDifficulty,
      threshold,
    };
  }
  return {
    dungeonDifficulty,
    heroic,
    looterGuidHigh,
    looterGuidLow,
    method,
    raidDifficulty,
    threshold,
  };
}
