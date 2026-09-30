import type { GroupList } from "#wow/protocol/group-list";

export const RAID_ASSISTANT_FLAG = 0x01;
export const RAID_MAIN_TANK_FLAG = 0x02;
export const RAID_MAIN_ASSIST_FLAG = 0x04;

export type RaidMember = {
  guid: bigint;
  name: string;
  status: number;
  subgroup: number;
  flags: number;
  roles: number;
};

export type RaidGroup = {
  kind: "party" | "raid";
  battleground: boolean;
  groupGuid: bigint;
  dungeonFinder: { status: number; dungeonId: number } | undefined;
  self: { subgroup: number; flags: number; roles: number };
  members: readonly RaidMember[];
  leader: bigint;
  loot: { method: number; master: bigint; threshold: number } | undefined;
  difficulty: { dungeon: number; raid: number; heroic: boolean } | undefined;
  counter: number;
};

export function readRaidGroup(packet: GroupList): RaidGroup {
  return {
    battleground: (packet.type & 0x01) !== 0,
    counter: packet.counter,
    difficulty: packet.loot
      ? {
          dungeon: packet.loot.dungeonDifficulty,
          heroic: packet.loot.heroic,
          raid: packet.loot.raidDifficulty,
        }
      : undefined,
    dungeonFinder:
      packet.dungeonId === undefined || packet.dungeonStatus === undefined
        ? undefined
        : { dungeonId: packet.dungeonId, status: packet.dungeonStatus },
    groupGuid:
      (BigInt(packet.groupGuidHigh) << 32n) | BigInt(packet.groupGuidLow),
    kind: (packet.type & 0x02) === 0 ? "party" : "raid",
    leader:
      (BigInt(packet.leaderGuidHigh) << 32n) | BigInt(packet.leaderGuidLow),
    loot: packet.loot
      ? {
          master:
            (BigInt(packet.loot.looterGuidHigh) << 32n) |
            BigInt(packet.loot.looterGuidLow),
          method: packet.loot.method,
          threshold: packet.loot.threshold,
        }
      : undefined,
    members: packet.members.map(
      (member): RaidMember => ({
        flags: member.flags,
        guid: (BigInt(member.guidHigh) << 32n) | BigInt(member.guidLow >>> 0),
        name: member.name,
        roles: member.roles,
        status: member.status,
        subgroup: member.subgroup,
      }),
    ),
    self: {
      flags: packet.ownFlags,
      roles: packet.ownRoles,
      subgroup: packet.ownSubgroup,
    },
  };
}

export function flagNames(flags: number): readonly string[] {
  const names: string[] = [];
  if ((flags & RAID_ASSISTANT_FLAG) !== 0) names.push("assistant");
  if ((flags & RAID_MAIN_TANK_FLAG) !== 0) names.push("main_tank");
  if ((flags & RAID_MAIN_ASSIST_FLAG) !== 0) names.push("main_assist");
  return names;
}
