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

function petOrNull(pet: GroupPetStats | undefined): RaidPet | null {
  if (!pet) return null;
  return {
    auras: pet.auras ? [...pet.auras] : [],
    displayId: pet.displayId ?? 0,
    guid: pet.guid ?? null,
    hp: pet.hp ?? 0,
    maxHp: pet.maxHp ?? 0,
    maxPower: pet.maxPower ?? 0,
    name: pet.name ?? "",
    power: pet.power ?? 0,
    powerType: pet.powerType ?? 0,
  };
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
    pet: stats.pet ? petOrNull(stats.pet) : (previous?.pet ?? null),
    position: stats.position
      ? { ...stats.position }
      : { ...(previous?.position ?? { x: 0, y: 0 }) },
    pvp: (status & 0x02) !== 0,
    pvpFfa: (status & 0x10) !== 0,
    seenAt,
    status,
  };
}
