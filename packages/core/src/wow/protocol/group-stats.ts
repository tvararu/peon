import { GroupUpdateFlag } from "#wow/protocol/enums";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const STATUS_ONLINE = 0x01;
export const STATUS_PVP = 0x02;
export const STATUS_DEAD = 0x04;
export const STATUS_GHOST = 0x08;
export const STATUS_PVP_FFA = 0x10;
export const STATUS_AFK = 0x40;
export const STATUS_DND = 0x80;

export type GroupAura = { slot: number; spellId: number; flags: number };

export type GroupPetStats = {
  guid?: bigint;
  name?: string;
  displayId?: number;
  hp?: number;
  maxHp?: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  auras?: readonly GroupAura[];
};

export type PartyMemberStats = {
  guidLow: number;
  guidHigh: number;
  online?: boolean;
  status?: number;
  hp?: number;
  maxHp?: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  level?: number;
  zone?: number;
  position?: { x: number; y: number };
  auras?: readonly GroupAura[];
  pet?: GroupPetStats;
  vehicleSeat?: number;
};

export type MemberStatusFlags = {
  online: boolean;
  pvp: boolean;
  dead: boolean;
  ghost: boolean;
  pvpFfa: boolean;
  afk: boolean;
  dnd: boolean;
};

export function memberStatusFlags(status: number): MemberStatusFlags {
  return {
    online: (status & STATUS_ONLINE) !== 0,
    pvp: (status & STATUS_PVP) !== 0,
    dead: (status & STATUS_DEAD) !== 0,
    ghost: (status & STATUS_GHOST) !== 0,
    pvpFfa: (status & STATUS_PVP_FFA) !== 0,
    afk: (status & STATUS_AFK) !== 0,
    dnd: (status & STATUS_DND) !== 0,
  };
}
function readAuras(r: PacketReader): GroupAura[] {
  const lo = r.uint32LE();
  const hi = r.uint32LE();
  const auras: GroupAura[] = [];
  for (let slot = 0; slot < 64; slot++) {
    const bit = slot < 32 ? lo & (1 << slot) : hi & (1 << (slot - 32));
    if (bit === 0) continue;
    auras.push({ slot, spellId: r.uint32LE(), flags: r.uint8() });
  }
  return auras;
}

function readMemberFields(
  r: PacketReader,
  mask: number,
  full: boolean,
  result: PartyMemberStats,
): void {
  if (mask & GroupUpdateFlag.STATUS) {
    const status = r.uint16LE();
    result.status = status;
    result.online = (status & STATUS_ONLINE) !== 0;
  }
  if (mask & GroupUpdateFlag.CUR_HP) result.hp = r.uint32LE();
  if (mask & GroupUpdateFlag.MAX_HP) result.maxHp = r.uint32LE();
  if (mask & GroupUpdateFlag.POWER_TYPE) {
    result.powerType = r.uint8();
  } else if (full) {
    result.powerType = 0;
  }
  if (mask & GroupUpdateFlag.CUR_POWER) result.power = r.uint16LE();
  if (mask & GroupUpdateFlag.MAX_POWER) result.maxPower = r.uint16LE();
  if (mask & GroupUpdateFlag.LEVEL) result.level = r.uint16LE();
  if (mask & GroupUpdateFlag.ZONE) result.zone = r.uint16LE();
  if (mask & GroupUpdateFlag.POSITION) {
    const x = r.uint16LE();
    const y = r.uint16LE();
    result.position = {
      x: x >= 0x80_00 ? x - 0x1_00_00 : x,
      y: y >= 0x80_00 ? y - 0x1_00_00 : y,
    };
  }
  if (mask & GroupUpdateFlag.AURAS) result.auras = readAuras(r);
}

function readPetFields(
  r: PacketReader,
  mask: number,
  result: PartyMemberStats,
): void {
  const pet: GroupPetStats = {};
  let seen = false;
  if (mask & GroupUpdateFlag.PET_GUID) {
    const low = r.uint32LE();
    const high = r.uint32LE();
    if (low !== 0 || high !== 0) {
      pet.guid = (BigInt(high) << 32n) | BigInt(low >>> 0);
      seen = true;
    }
  }
  if (mask & GroupUpdateFlag.PET_NAME) {
    pet.name = r.cString();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_MODEL_ID) {
    pet.displayId = r.uint16LE();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_CUR_HP) {
    pet.hp = r.uint32LE();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_MAX_HP) {
    pet.maxHp = r.uint32LE();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_POWER_TYPE) {
    pet.powerType = r.uint8();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_CUR_POWER) {
    pet.power = r.uint16LE();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_MAX_POWER) {
    pet.maxPower = r.uint16LE();
    seen = true;
  }
  if (mask & GroupUpdateFlag.PET_AURAS) {
    pet.auras = readAuras(r);
    seen = true;
  }
  if (mask & GroupUpdateFlag.VEHICLE_SEAT) result.vehicleSeat = r.uint32LE();
  if (seen) result.pet = pet;
}

export function parsePartyMemberStats(
  r: PacketReader,
  isFull = false,
): PartyMemberStats {
  if (isFull) r.uint8();
  const { low: guidLow, high: guidHigh } = r.packedGuid();
  const mask = r.uint32LE();
  const result: PartyMemberStats = { guidLow, guidHigh };
  readMemberFields(r, mask, isFull, result);
  readPetFields(r, mask, result);
  return result;
}

export function buildRequestPartyMemberStats(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}
