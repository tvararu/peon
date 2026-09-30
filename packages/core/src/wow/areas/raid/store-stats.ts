import type {
  GroupAura,
  GroupPetStats,
  PartyMemberStats,
} from "#wow/protocol/group-stats";

export type RaidAura = GroupAura;

export type RaidPet = {
  guid: bigint | null;
  name: string;
  displayId: number;
  hp: number;
  maxHp: number;
  powerType: number;
  power: number;
  maxPower: number;
  auras: readonly RaidAura[];
};

function defaultPet(): RaidPet {
  return {
    auras: [],
    displayId: 0,
    guid: null,
    hp: 0,
    maxHp: 0,
    maxPower: 0,
    name: "",
    power: 0,
    powerType: 0,
  };
}

function mergePet(pet: GroupPetStats, previous: RaidPet | null): RaidPet {
  const base = previous ?? defaultPet();
  return {
    auras: pet.auras ? [...pet.auras] : [...base.auras],
    displayId: pet.displayId ?? base.displayId,
    guid: pet.guid ?? base.guid,
    hp: pet.hp ?? base.hp,
    maxHp: pet.maxHp ?? base.maxHp,
    maxPower: pet.maxPower ?? base.maxPower,
    name: pet.name ?? base.name,
    power: pet.power ?? base.power,
    powerType: pet.powerType ?? base.powerType,
  };
}

function mergePetUpdate(
  update: GroupPetStats | null | undefined,
  previous: RaidPet | null,
): RaidPet | null {
  if (update === undefined) return previous;
  if (update === null) return null;
  return mergePet(update, previous);
}

export type StatsTransition =
  | "died"
  | "ghost"
  | "revived"
  | "offline"
  | "online";

export type MemberStats = {
  guid: bigint;
  name: string;
  status: number;
  online: boolean;
  pvp: boolean;
  dead: boolean;
  ghost: boolean;
  pvpFfa: boolean;
  afk: boolean;
  dnd: boolean;
  hp: number;
  maxHp: number;
  powerType: number;
  power: number;
  maxPower: number;
  level: number;
  zone: number;
  position: { x: number; y: number };
  auras: readonly RaidAura[];
  pet: RaidPet | null;
  vehicleSeat: number;
  seenAt: number;
};

export type StatsEvent = {
  type: "member_stats";
  guid: bigint;
  name: string;
  transitions: readonly StatsTransition[];
};

export function statsTransitions(
  before: { status: number } | undefined,
  after: { status: number },
): StatsTransition[] {
  if (!before) return [];
  const wasOnline = (before.status & 0x01) !== 0;
  const online = (after.status & 0x01) !== 0;
  if (wasOnline !== online) return [online ? "online" : "offline"];
  if (!online) return [];
  const wasGone = (before.status & 0x0c) !== 0;
  const dead = (after.status & 0x04) !== 0;
  const ghost = (after.status & 0x08) !== 0;
  if (!wasGone && dead) return ["died"];
  if ((before.status & 0x08) === 0 && ghost) return ["ghost"];
  if (wasGone && !dead && !ghost) return ["revived"];
  return [];
}

function mergeVitals(
  stats: PartyMemberStats,
  previous: MemberStats | undefined,
): Pick<
  MemberStats,
  | "hp"
  | "maxHp"
  | "powerType"
  | "power"
  | "maxPower"
  | "level"
  | "zone"
  | "vehicleSeat"
> {
  return {
    hp: stats.hp ?? previous?.hp ?? 0,
    level: stats.level ?? previous?.level ?? 0,
    maxHp: stats.maxHp ?? previous?.maxHp ?? 0,
    maxPower: stats.maxPower ?? previous?.maxPower ?? 0,
    power: stats.power ?? previous?.power ?? 0,
    powerType: stats.powerType ?? previous?.powerType ?? 0,
    vehicleSeat: stats.vehicleSeat ?? previous?.vehicleSeat ?? 0,
    zone: stats.zone ?? previous?.zone ?? 0,
  };
}

export function mergeMemberStats(
  stats: PartyMemberStats,
  previous: MemberStats | undefined,
  name: string,
  seenAt: number,
): MemberStats {
  const guid = (BigInt(stats.guidHigh) << 32n) | BigInt(stats.guidLow >>> 0);
  const status = stats.status ?? previous?.status ?? 0;
  return {
    ...mergeVitals(stats, previous),
    afk: (status & 0x40) !== 0,
    auras: stats.auras ? [...stats.auras] : [...(previous?.auras ?? [])],
    dead: (status & 0x04) !== 0,
    dnd: (status & 0x80) !== 0,
    ghost: (status & 0x08) !== 0,
    guid,
    name,
    online: stats.online ?? previous?.online ?? false,
    pet: mergePetUpdate(stats.pet, previous?.pet ?? null),
    position: stats.position
      ? { ...stats.position }
      : { ...(previous?.position ?? { x: 0, y: 0 }) },
    pvp: (status & 0x02) !== 0,
    pvpFfa: (status & 0x10) !== 0,
    seenAt,
    status,
  };
}
