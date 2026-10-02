import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const BG_TYPE_ALL_ARENAS = 6;
export const PORT_WORD = 0x1f_90;

const STATUS_WAIT_QUEUE = 1;
const STATUS_WAIT_JOIN = 2;
const STATUS_IN_PROGRESS = 3;
const STATUS_WAIT_LEAVE = 4;

export type BattlefieldRewards = {
  hasWin: boolean;
  winHonor: number;
  winArena: number;
  lossHonor: number;
};

export type BattlefieldList = {
  guid: bigint;
  fromWhere: number;
  bgType: number;
  rewards: BattlefieldRewards;
  random: BattlefieldRewards | undefined;
  instances: readonly number[];
};

export type BattlefieldStatusCommon = {
  slot: number;
  arenaType: number;
  isArena: number;
  bgType: number;
  word: number;
  minLevel: number;
  maxLevel: number;
  instanceId: number;
  rated: boolean;
};

export type BattlefieldStatus =
  | { kind: "none"; slot: number }
  | (BattlefieldStatusCommon & {
      kind: "queued";
      avgWaitMs: number;
      inQueueMs: number;
    })
  | (BattlefieldStatusCommon & {
      kind: "invited";
      mapId: number;
      timeToRemoveMs: number;
    })
  | (BattlefieldStatusCommon & {
      kind: "active";
      mapId: number;
      autoLeaveMs: number;
      elapsedMs: number;
      faction: number;
    })
  | (BattlefieldStatusCommon & { kind: "leaving" });

export type GroupJoined = { result: number; guid: bigint | undefined };

const GROUP_JOINED_NAMES: Readonly<Record<number, string>> = {
  [-1]: "none",
  [-10]: "join_range_index",
  [-11]: "join_timed_out",
  [-12]: "join_failed",
  [-13]: "lfg",
  [-14]: "in_random",
  [-15]: "in_non_random",
  [-2]: "deserter",
  [-3]: "arena_party_size",
  [-4]: "too_many_queues",
  [-5]: "cannot_queue_for_rated",
  [-6]: "queued_for_rated",
  [-7]: "team_left_queue",
  [-8]: "in_battleground",
  [-9]: "join_xp_gain",
  0: "not_eligible",
};

export function groupJoinedName(result: number): string | undefined {
  if (result > 0) return undefined;
  return GROUP_JOINED_NAMES[result] ?? `error_${result}`;
}

function readRewards(reader: PacketReader): BattlefieldRewards {
  const hasWin = reader.uint8() !== 0;
  const winHonor = reader.uint32LE();
  const winArena = reader.uint32LE();
  const lossHonor = reader.uint32LE();
  return { hasWin, lossHonor, winArena, winHonor };
}

export function parseBattlefieldList(reader: PacketReader): BattlefieldList {
  const guid = reader.uint64LE();
  const fromWhere = reader.uint8();
  const bgType = reader.uint32LE();
  reader.skip(2);
  const rewards = readRewards(reader);
  const random = reader.uint8() === 0 ? undefined : readRewards(reader);
  const instances: number[] = [];
  const count = reader.uint32LE();
  if (bgType !== BG_TYPE_ALL_ARENAS)
    for (let i = 0; i < count; i++) instances.push(reader.uint32LE());
  return { bgType, fromWhere, guid, instances, random, rewards };
}

export function parseBattlefieldStatus(
  reader: PacketReader,
): BattlefieldStatus {
  const slot = reader.uint32LE();
  if (reader.remaining === 8) return { kind: "none", slot };
  const arenaType = reader.uint8();
  const isArena = reader.uint8();
  const bgType = reader.uint32LE();
  const word = reader.uint16LE();
  const minLevel = reader.uint8();
  const maxLevel = reader.uint8();
  const instanceId = reader.uint32LE();
  const rated = reader.uint8() !== 0;
  const common = {
    arenaType,
    bgType,
    instanceId,
    isArena,
    maxLevel,
    minLevel,
    rated,
    slot,
    word,
  };
  const status = reader.uint32LE();
  if (status === STATUS_WAIT_QUEUE) {
    const avgWaitMs = reader.uint32LE();
    const inQueueMs = reader.uint32LE();
    return { ...common, avgWaitMs, inQueueMs, kind: "queued" };
  }
  if (status === STATUS_WAIT_JOIN) {
    const mapId = reader.uint32LE();
    reader.skip(8);
    const timeToRemoveMs = reader.uint32LE();
    return { ...common, kind: "invited", mapId, timeToRemoveMs };
  }
  if (status === STATUS_IN_PROGRESS) {
    const mapId = reader.uint32LE();
    reader.skip(8);
    const autoLeaveMs = reader.uint32LE();
    const elapsedMs = reader.uint32LE();
    const faction = reader.uint8();
    return {
      ...common,
      autoLeaveMs,
      elapsedMs,
      faction,
      kind: "active",
      mapId,
    };
  }
  if (status === STATUS_WAIT_LEAVE) return { ...common, kind: "leaving" };
  throw new Error(`unknown battlefield status ${status}`);
}

export function parseGroupJoinedBattleground(
  reader: PacketReader,
): GroupJoined {
  const result = reader.int32LE();
  const guid = result === -11 || result === -12 ? reader.uint64LE() : undefined;
  return { guid, result };
}

export function buildBattlemasterHello(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildBattlefieldList(
  bgType: number,
  fromWhere: number,
  canGainXp: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(bgType);
  w.uint8(fromWhere);
  w.uint8(canGainXp);
  return w.finish();
}

export function buildBattlemasterJoin(
  guid: bigint,
  bgType: number,
  instanceId: number,
  asGroup: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(bgType);
  w.uint32LE(instanceId);
  w.uint8(asGroup ? 1 : 0);
  return w.finish();
}

export function buildBattlefieldPort(
  arenaType: number,
  bgType: number,
  accept: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(arenaType);
  w.uint8(0);
  w.uint32LE(bgType);
  w.uint16LE(PORT_WORD);
  w.uint8(accept ? 1 : 0);
  return w.finish();
}
