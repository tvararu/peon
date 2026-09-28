import {
  type CriteriaProgress,
  readCriteriaProgress,
} from "#wow/protocol/achievement-data";
import { type PackedTime, readPackedTime } from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";

export type AchievementEarned = { guid: bigint; id: number; at: PackedTime };
export type ServerFirst = {
  name: string;
  guid: bigint;
  id: number;
  link: number;
};
export type AchievementId = { id: number };

export function parseCriteriaUpdate(r: PacketReader): CriteriaProgress {
  return readCriteriaProgress(r, r.uint32LE());
}

export function parseAchievementEarned(r: PacketReader): AchievementEarned {
  const guid = r.packedGuidBig();
  const id = r.uint32LE();
  const at = readPackedTime(r);
  r.uint32LE();
  return { guid, id, at };
}

export function parseServerFirst(r: PacketReader): ServerFirst {
  const name = r.cString();
  const guid = r.uint64LE();
  const id = r.uint32LE();
  const link = r.uint32LE();
  return { name, guid, id, link };
}

export function parseCriteriaDeleted(r: PacketReader): AchievementId {
  const id = r.uint32LE();
  return { id };
}

export function parseAchievementDeleted(r: PacketReader): AchievementId {
  const id = r.uint32LE();
  return { id };
}
