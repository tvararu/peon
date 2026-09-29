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

export type RaidStatsAura = { slot: number; spellId: number; flags?: number };

export type RaidStatsPet = {
  guid?: bigint;
  name?: string;
  displayId?: number;
  hp?: number;
  maxHp?: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  auras?: readonly RaidStatsAura[];
};

export type RaidStatsInit = {
  guid: bigint;
  status?: number;
  hp?: number;
  maxHp?: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  level?: number;
  zone?: number;
  position?: { x: number; y: number };
  auras?: readonly RaidStatsAura[];
  pet?: RaidStatsPet;
  vehicleSeat?: number;
};

const STATS_STATUS = 0x1;
const STATS_CUR_HP = 0x2;
const STATS_MAX_HP = 0x4;
const STATS_POWER_TYPE = 0x8;
const STATS_CUR_POWER = 0x10;
const STATS_MAX_POWER = 0x20;
const STATS_LEVEL = 0x40;
const STATS_ZONE = 0x80;
const STATS_POSITION = 0x1_00;
const STATS_AURAS = 0x2_00;
const STATS_PET_GUID = 0x4_00;
const STATS_PET_NAME = 0x8_00;
const STATS_PET_MODEL_ID = 0x10_00;
const STATS_PET_CUR_HP = 0x20_00;
const STATS_PET_MAX_HP = 0x40_00;
const STATS_PET_POWER_TYPE = 0x80_00;
const STATS_PET_CUR_POWER = 0x1_00_00;
const STATS_PET_MAX_POWER = 0x2_00_00;
const STATS_PET_AURAS = 0x4_00_00;
const STATS_VEHICLE_SEAT = 0x8_00_00;

function statsMask(init: RaidStatsInit): number {
  const pet = init.pet;
  const flags: readonly [number, boolean][] = [
    [STATS_STATUS, init.status !== undefined],
    [STATS_CUR_HP, init.hp !== undefined],
    [STATS_MAX_HP, init.maxHp !== undefined],
    [STATS_POWER_TYPE, init.powerType !== undefined],
    [STATS_CUR_POWER, init.power !== undefined],
    [STATS_MAX_POWER, init.maxPower !== undefined],
    [STATS_LEVEL, init.level !== undefined],
    [STATS_ZONE, init.zone !== undefined],
    [STATS_POSITION, init.position !== undefined],
    [STATS_AURAS, init.auras !== undefined],
    [STATS_PET_GUID, pet?.guid !== undefined],
    [STATS_PET_NAME, pet?.name !== undefined],
    [STATS_PET_MODEL_ID, pet?.displayId !== undefined],
    [STATS_PET_CUR_HP, pet?.hp !== undefined],
    [STATS_PET_MAX_HP, pet?.maxHp !== undefined],
    [STATS_PET_POWER_TYPE, pet?.powerType !== undefined],
    [STATS_PET_CUR_POWER, pet?.power !== undefined],
    [STATS_PET_MAX_POWER, pet?.maxPower !== undefined],
    [STATS_PET_AURAS, pet?.auras !== undefined],
    [STATS_VEHICLE_SEAT, init.vehicleSeat !== undefined],
  ];
  return flags.reduce((mask, [bit, on]) => (on ? mask | bit : mask), 0);
}

function writeAuras(
  w: PacketWriter,
  auras: readonly RaidStatsAura[] | undefined,
): void {
  const sorted = [...(auras ?? [])].sort((a, b) => a.slot - b.slot);
  let mask = 0n;
  for (const aura of sorted) mask |= 1n << BigInt(aura.slot);
  w.uint64LE(mask);
  for (const aura of sorted) {
    w.uint32LE(aura.spellId);
    w.uint8(aura.flags ?? 1);
  }
}

function writePackedGuid(w: PacketWriter, guid: bigint): void {
  w.packedGuidBig(guid);
}

export function raidPartyMemberStatsBody(init: RaidStatsInit): Uint8Array {
  const w = new PacketWriter();
  const mask = statsMask(init);
  writePackedGuid(w, init.guid);
  w.uint32LE(mask);
  writeStatsFields(w, init, mask);
  return w.finish();
}

function writePowerStats(
  w: PacketWriter,
  init: RaidStatsInit,
  mask: number,
): void {
  if (mask & STATS_CUR_HP) w.uint32LE(init.hp ?? 0);
  if (mask & STATS_MAX_HP) w.uint32LE(init.maxHp ?? 0);
  if (mask & STATS_POWER_TYPE) w.uint8(init.powerType ?? 0);
  if (mask & STATS_CUR_POWER) w.uint16LE(init.power ?? 0);
  if (mask & STATS_MAX_POWER) w.uint16LE(init.maxPower ?? 0);
  if (mask & STATS_LEVEL) w.uint16LE(init.level ?? 0);
}

function writeMainStats(
  w: PacketWriter,
  init: RaidStatsInit,
  mask: number,
): void {
  if (mask & STATS_STATUS) w.uint16LE(init.status ?? 0);
  writePowerStats(w, init, mask);
  if (mask & STATS_ZONE) w.uint16LE(init.zone ?? 0);
  if (mask & STATS_POSITION) {
    w.uint16LE((init.position?.x ?? 0) & 0xff_ff);
    w.uint16LE((init.position?.y ?? 0) & 0xff_ff);
  }
  if (mask & STATS_AURAS) writeAuras(w, init.auras);
}

function writePetHealth(
  w: PacketWriter,
  pet: RaidStatsPet | undefined,
  mask: number,
): void {
  if (mask & STATS_PET_GUID) w.uint64LE(pet?.guid ?? 0n);
  if (mask & STATS_PET_NAME) w.cString(pet?.name ?? "");
  if (mask & STATS_PET_MODEL_ID) w.uint16LE(pet?.displayId ?? 0);
  if (mask & STATS_PET_CUR_HP) w.uint32LE(pet?.hp ?? 0);
  if (mask & STATS_PET_MAX_HP) w.uint32LE(pet?.maxHp ?? 0);
}

function writePetStats(
  w: PacketWriter,
  pet: RaidStatsPet | undefined,
  mask: number,
): void {
  writePetHealth(w, pet, mask);
  if (mask & STATS_PET_POWER_TYPE) w.uint8(pet?.powerType ?? 0);
  if (mask & STATS_PET_CUR_POWER) w.uint16LE(pet?.power ?? 0);
  if (mask & STATS_PET_MAX_POWER) w.uint16LE(pet?.maxPower ?? 0);
  if (mask & STATS_PET_AURAS) writeAuras(w, pet?.auras);
}

function writeStatsFields(
  w: PacketWriter,
  init: RaidStatsInit,
  mask: number,
): void {
  writeMainStats(w, init, mask);
  writePetStats(w, init.pet, mask);
  if (mask & STATS_VEHICLE_SEAT) w.uint32LE(init.vehicleSeat ?? 0);
}

const FULL_BASE_MASK =
  STATS_STATUS |
  STATS_CUR_HP |
  STATS_MAX_HP |
  STATS_CUR_POWER |
  STATS_MAX_POWER |
  STATS_LEVEL |
  STATS_ZONE |
  STATS_POSITION |
  STATS_AURAS |
  STATS_PET_NAME |
  STATS_PET_MODEL_ID |
  STATS_PET_AURAS;

const FULL_PET_MASK =
  STATS_PET_GUID |
  STATS_PET_CUR_HP |
  STATS_PET_MAX_HP |
  STATS_PET_POWER_TYPE |
  STATS_PET_CUR_POWER |
  STATS_PET_MAX_POWER;

function fullStatsMask(init: RaidStatsInit): number {
  let mask = FULL_BASE_MASK;
  if (init.powerType !== undefined && init.powerType !== 0)
    mask |= STATS_POWER_TYPE;
  if (init.pet) mask |= FULL_PET_MASK;
  if (init.vehicleSeat !== undefined) mask |= STATS_VEHICLE_SEAT;
  return mask;
}

function withFullDefaults(init: RaidStatsInit): RaidStatsInit {
  const pet = init.pet;
  return {
    ...init,
    auras: init.auras ?? [],
    hp: init.hp ?? 0,
    level: init.level ?? 0,
    maxHp: init.maxHp ?? 0,
    maxPower: init.maxPower ?? 0,
    pet: {
      ...pet,
      auras: pet?.auras ?? [],
      displayId: pet?.displayId ?? 0,
      name: pet?.name ?? "",
    },
    position: init.position ?? { x: 0, y: 0 },
    power: init.power ?? 0,
    status: init.status ?? 0,
    zone: init.zone ?? 0,
  };
}

export function raidPartyMemberStatsFullBody(init: RaidStatsInit): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  writePackedGuid(w, init.guid);
  const mask = fullStatsMask(init);
  w.uint32LE(mask);
  writeStatsFields(w, withFullDefaults(init), mask);
  return w.finish();
}

export function raidPartyMemberOfflineBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  writePackedGuid(w, guid);
  w.uint32LE(STATS_STATUS);
  w.uint16LE(0);
  return w.finish();
}

export function raidReadyCheckBody(initiator: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(initiator);
  return w.finish();
}

export function raidReadyConfirmBody(guid: bigint, state: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint8(state);
  return w.finish();
}
