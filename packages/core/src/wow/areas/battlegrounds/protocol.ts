import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type PvpCredit = {
  honor: number;
  victim: bigint;
  rank: number;
};

export type InspectHonorStats = {
  guid: bigint;
  honor: number;
  kills: number;
  today: number;
  yesterday: number;
  lifetime: number;
};

export type PvpKillQuest = {
  quest: number;
  count: number;
  required: number;
};

export function parsePvpCredit(reader: PacketReader): PvpCredit {
  const honor = reader.int32LE();
  const victim = reader.uint64LE();
  const rank = reader.int32LE();
  return { honor, victim, rank };
}

export function parseInspectHonorStats(
  reader: PacketReader,
): InspectHonorStats {
  const guid = reader.uint64LE();
  const honor = reader.uint8();
  const kills = reader.uint32LE();
  const today = reader.uint32LE();
  const yesterday = reader.uint32LE();
  const lifetime = reader.uint32LE();
  return { guid, honor, kills, lifetime, today, yesterday };
}

export function parseZoneUnderAttack(reader: PacketReader): {
  areaId: number;
} {
  return { areaId: reader.uint32LE() };
}

export function parseQuestUpdateAddPvpKill(reader: PacketReader): PvpKillQuest {
  const quest = reader.uint32LE();
  const count = reader.uint32LE();
  const required = reader.uint32LE();
  return { count, quest, required };
}

export function buildTogglePvp(on?: boolean): Uint8Array {
  const w = new PacketWriter();
  if (on !== undefined) w.uint8(on ? 1 : 0);
  return w.finish();
}

export function buildInspectHonorStats(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}
