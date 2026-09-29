import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

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
export type RaidLock = {
  mapId: number;
  difficulty: number;
  instanceGuid: bigint;
  locked: boolean;
  extended: boolean;
  secondsToReset: number;
};
export type LockWarning = { timeoutMs: number; encounterMask: number };
export type LockoutExtension = {
  mapId: number;
  difficulty: number;
  extended: boolean;
};
export type RaidGroupOnly = { timerMs: number; code: number };
export type InstanceReset = { mapId: number };
export type InstanceResetFailed = { reason: number; mapId: number };

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

export function parseRaidInstanceInfo(r: PacketReader): RaidLock[] {
  const count = r.uint32LE();
  const locks: RaidLock[] = [];
  for (let i = 0; i < count; i++) {
    const mapId = r.uint32LE();
    const difficulty = r.uint32LE();
    const instanceGuid = r.uint64LE();
    const locked = r.uint8() !== 0;
    const extended = r.uint8() !== 0;
    const secondsToReset = r.uint32LE();
    locks.push({
      mapId,
      difficulty,
      instanceGuid,
      locked,
      extended,
      secondsToReset,
    });
  }
  return locks;
}

export function parseLockWarning(r: PacketReader): LockWarning {
  const timeoutMs = r.uint32LE();
  const encounterMask = r.uint32LE();
  r.uint8();
  return { timeoutMs, encounterMask };
}

export function parseInstanceReset(r: PacketReader): InstanceReset {
  return { mapId: r.uint32LE() };
}

export function parseInstanceResetFailed(r: PacketReader): InstanceResetFailed {
  const reason = r.uint32LE();
  const mapId = r.uint32LE();
  return { reason, mapId };
}

export function parseResetFailedNotify(r: PacketReader): InstanceReset {
  return { mapId: r.uint32LE() };
}

function u32(value: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(value);
  return w.finish();
}

export function buildSetDungeonDifficulty(mode: number): Uint8Array {
  return u32(mode);
}

export function buildSetRaidDifficulty(mode: number): Uint8Array {
  return u32(mode);
}

export function buildResetInstances(): Uint8Array {
  return new Uint8Array();
}

export function buildRequestRaidInfo(): Uint8Array {
  return new Uint8Array();
}

export function buildLockResponse(accept: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(accept ? 1 : 0);
  return w.finish();
}

export function buildSetLockoutExtended(init: LockoutExtension): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.mapId);
  w.uint32LE(init.difficulty);
  w.uint8(init.extended ? 1 : 0);
  return w.finish();
}
