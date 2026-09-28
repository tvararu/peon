import type { PacketReader } from "#wow/protocol/packet";

export const RAID_INSTANCE_WELCOME = 4;

export type DifficultyPacket = { difficulty: number; inGroup: boolean };
export type InstanceDifficulty = { difficulty: number; dynamicHeroic: boolean };
export type InstanceOwnership = { hasBinds: boolean };
export type LastInstance = { mapId: number };
export type RaidInstanceMessage = {
  kind: number;
  mapId: number;
  difficulty: number;
  secondsLeft: number;
  locked: boolean | undefined;
  extended: boolean | undefined;
};
export type RaidGroupOnly = { timerMs: number; code: number };

export function parseDifficulty(r: PacketReader): DifficultyPacket {
  const difficulty = r.uint32LE();
  r.uint32LE();
  const inGroup = r.uint32LE() !== 0;
  return { difficulty, inGroup };
}

export function parseInstanceDifficulty(r: PacketReader): InstanceDifficulty {
  const difficulty = r.uint32LE();
  const dynamicHeroic = r.uint32LE() !== 0;
  return { difficulty, dynamicHeroic };
}

export function parseInstanceOwnership(r: PacketReader): InstanceOwnership {
  return { hasBinds: r.uint32LE() !== 0 };
}

export function parseLastInstance(r: PacketReader): LastInstance {
  return { mapId: r.uint32LE() };
}

export function parseRaidInstanceMessage(r: PacketReader): RaidInstanceMessage {
  const kind = r.uint32LE();
  const mapId = r.uint32LE();
  const difficulty = r.uint32LE();
  const secondsLeft = r.uint32LE();
  const welcome = kind === RAID_INSTANCE_WELCOME;
  const locked = welcome ? r.uint8() !== 0 : undefined;
  const extended = welcome ? r.uint8() !== 0 : undefined;
  return { kind, mapId, difficulty, secondsLeft, locked, extended };
}

export function parseRaidGroupOnly(r: PacketReader): RaidGroupOnly {
  const timerMs = r.uint32LE();
  const code = r.uint32LE();
  return { timerMs, code };
}
