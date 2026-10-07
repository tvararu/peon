import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const WINTERGRASP_ZONE = 4197;
export const WINTERGRASP_MAP = 571;

export const LEAVE_REASON_NAMES: Record<number, string> = {
  1: "close",
  8: "exited",
  16: "low_level",
};

export type WgEntryInvite = {
  battleId: number;
  zone: number;
  expiresAt: number;
};
export type WgQueueInvite = { battleId: number; warmup: boolean };
export type WgQueueResponse = {
  battleId: number;
  zone: number;
  queued: boolean;
  full: boolean;
  warmup: boolean;
};
export type WgEntered = { battleId: number; clearAfk: boolean };
export type WgEjected = {
  battleId: number;
  reason: number;
  status: number;
  relocated: boolean;
};
export type WgBuildingDamage = {
  building: bigint;
  attacker: bigint;
  player: bigint;
  damage: number;
  spell: number;
};

export function parseEntryInvite(reader: PacketReader): WgEntryInvite {
  return {
    battleId: reader.uint32LE(),
    zone: reader.uint32LE(),
    expiresAt: reader.uint32LE(),
  };
}

export function parseQueueInvite(reader: PacketReader): WgQueueInvite {
  return { battleId: reader.uint32LE(), warmup: reader.uint8() !== 0 };
}

export function parseQueueResponse(reader: PacketReader): WgQueueResponse {
  const battleId = reader.uint32LE();
  const zone = reader.uint32LE();
  const queued = reader.uint8() !== 0;
  const notFull = reader.uint8() !== 0;
  const warmup = reader.uint8() !== 0;
  return { battleId, full: !notFull, queued, warmup, zone };
}

export function parseEntered(reader: PacketReader): WgEntered {
  const battleId = reader.uint32LE();
  reader.skip(2);
  return { battleId, clearAfk: reader.uint8() !== 0 };
}

export function parseEjected(reader: PacketReader): WgEjected {
  return {
    battleId: reader.uint32LE(),
    reason: reader.uint8(),
    status: reader.uint8(),
    relocated: reader.uint8() !== 0,
  };
}

export function parseBuildingDamage(reader: PacketReader): WgBuildingDamage {
  const building = reader.packedGuidBig();
  const attacker = reader.packedGuidBig();
  const player = reader.packedGuidBig();
  const damage = reader.int32LE();
  const spell = reader.uint32LE();
  return { attacker, building, damage, player, spell };
}

function idAndFlag(battleId: number, accept: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(battleId);
  w.uint8(accept ? 1 : 0);
  return w.finish();
}

export function buildQueueInviteResponse(
  battleId: number,
  accept: boolean,
): Uint8Array {
  return idAndFlag(battleId, accept);
}

export function buildEntryInviteResponse(
  battleId: number,
  accept: boolean,
): Uint8Array {
  return idAndFlag(battleId, accept);
}

export function buildExitRequest(battleId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(battleId);
  return w.finish();
}
