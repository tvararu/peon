import type { GroupList } from "#wow/protocol/group-list";
import { joinGuid } from "#wow/protocol/packet";

export const LOOT_METHODS: Record<number, string> = {
  0: "free_for_all",
  1: "round_robin",
  2: "master_loot",
  3: "group_loot",
  4: "need_before_greed",
};

export const ITEM_QUALITIES: Record<number, string> = {
  0: "poor",
  1: "common",
  2: "uncommon",
  3: "rare",
  4: "epic",
  5: "legendary",
  6: "artifact",
  7: "heirloom",
};

export type MemberAura = { slot: number; spellId: number; flags: number };

export type MemberPet = {
  guid: bigint | null;
  name: string | null;
  displayId: number | null;
  hp: number | null;
  maxHp: number | null;
  powerType: number | null;
  power: number | null;
  maxPower: number | null;
  auras: readonly MemberAura[];
};

export type PartyMemberStats = {
  online?: boolean;
  hp?: number;
  maxHp?: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  level?: number;
  zone?: number;
  position?: { x: number; y: number };
  auras?: readonly MemberAura[];
  pet?: {
    guid?: bigint;
    name?: string;
    displayId?: number;
    hp?: number;
    maxHp?: number;
    powerType?: number;
    power?: number;
    maxPower?: number;
    auras?: readonly MemberAura[];
  } | null;
  vehicleSeat?: number;
};

export type PartyMember = {
  name: string;
  guid: bigint;
  online: boolean;
  status: number;
  subgroup: number;
  flags: number;
  roles: number;
  health: number | null;
  maxHealth: number | null;
  powerType: number | null;
  power: number | null;
  maxPower: number | null;
  level: number | null;
  zone: number | null;
  position: { x: number; y: number } | null;
  auras: readonly MemberAura[];
  pet: MemberPet | null;
  vehicleSeat: number | null;
  statsAt: number | null;
  source: "unit" | "party_stats" | null;
};

export type PartyUnit = {
  health: number;
  maxHealth: number;
  powerType?: number;
  power?: number;
  maxPower?: number;
  level: number;
};

export function emptyMemberPet(): MemberPet {
  return {
    auras: [],
    displayId: null,
    guid: null,
    hp: null,
    maxHp: null,
    maxPower: null,
    name: null,
    power: null,
    powerType: null,
  };
}

export type PartyLoot = {
  method: string;
  masterLooter: bigint | null;
  threshold: string;
};

export type PartyState = {
  kind: "party" | "raid";
  inGroup: boolean;
  leader: string | null;
  ownSubgroup: number;
  ownFlags: number;
  ownRoles: number;
  dungeonFinder: { status: number; dungeonId: number } | undefined;
  counter: number;
  difficulty: { dungeon: number; raid: number; heroic: boolean } | undefined;
  loot: PartyLoot | null;
  members: PartyMember[];
};

export type PartyChange = {
  formed: boolean;
  added: string[];
  removed: string[];
};

type RosterMember = GroupList["members"][number];

type Stats = Omit<
  PartyMember,
  | "name"
  | "guid"
  | "online"
  | "source"
  | "status"
  | "subgroup"
  | "flags"
  | "roles"
>;

function toMember(member: RosterMember): PartyMember {
  return {
    auras: [],
    flags: member.flags,
    guid: joinGuid(member.guidLow, member.guidHigh),
    health: null,
    level: null,
    maxHealth: null,
    maxPower: null,
    name: member.name,
    online: member.online,
    pet: null,
    position: null,
    power: null,
    powerType: null,
    roles: member.roles,
    source: null,
    statsAt: null,
    status: member.status,
    subgroup: member.subgroup,
    vehicleSeat: null,
    zone: null,
  };
}

function toLoot(loot: GroupList["loot"]): PartyState["loot"] {
  if (!loot) return null;
  const looter = joinGuid(loot.looterGuidLow, loot.looterGuidHigh);
  return {
    masterLooter: looter === 0n ? null : looter,
    method: LOOT_METHODS[loot.method] ?? `method_${loot.method}`,
    threshold: ITEM_QUALITIES[loot.threshold] ?? `quality_${loot.threshold}`,
  };
}

function toDifficulty(loot: GroupList["loot"]): PartyState["difficulty"] {
  if (!loot) return undefined;
  return {
    dungeon: loot.dungeonDifficulty,
    heroic: loot.heroic,
    raid: loot.raidDifficulty,
  };
}

export function emptyParty(): PartyState {
  return {
    counter: 0,
    difficulty: undefined,
    dungeonFinder: undefined,
    inGroup: false,
    kind: "party",
    leader: null,
    loot: null,
    members: [],
    ownFlags: 0,
    ownRoles: 0,
    ownSubgroup: 0,
  };
}

function mergePet(
  update: PartyMemberStats["pet"],
  previous: MemberPet | null,
): MemberPet | null {
  if (update === null) return null;
  const present = update ?? previous;
  if (!present) return null;
  const base = previous ?? emptyMemberPet();
  return {
    auras: update?.auras ? [...update.auras] : [...base.auras],
    displayId: update?.displayId ?? base.displayId,
    guid: update?.guid ?? base.guid,
    hp: update?.hp ?? base.hp,
    maxHp: update?.maxHp ?? base.maxHp,
    maxPower: update?.maxPower ?? base.maxPower,
    name: update?.name ?? base.name,
    power: update?.power ?? base.power,
    powerType: update?.powerType ?? base.powerType,
  };
}
export class PartyStore {
  private state: PartyState = emptyParty();
  private readonly stats = new Map<bigint, Stats>();

  snapshot(
    unitOf: (guid: bigint) => PartyUnit | undefined = () => undefined,
    now = 0,
  ): PartyState {
    return {
      ...this.state,
      loot: this.state.loot ? { ...this.state.loot } : null,
      members: this.state.members.map((member): PartyMember => {
        const unit = unitOf(member.guid);
        if (unit) return { ...member, ...unit, source: "unit", statsAt: now };
        const stats = this.stats.get(member.guid);
        return stats ? { ...member, ...stats, source: "party_stats" } : member;
      }),
    };
  }

  applyList(list: GroupList, leader: string): PartyChange {
    const before = new Set(this.state.members.map((member) => member.name));
    const formed = !this.state.inGroup && list.members.length > 0;
    const members = list.members.map(toMember);
    this.state = {
      counter: list.counter,
      difficulty: toDifficulty(list.loot),
      dungeonFinder:
        list.dungeonId === undefined || list.dungeonStatus === undefined
          ? undefined
          : { dungeonId: list.dungeonId, status: list.dungeonStatus },
      inGroup: members.length > 0,
      kind: (list.type & 0x02) === 0 ? "party" : "raid",
      leader: members.length > 0 ? leader || null : null,
      loot: toLoot(list.loot),
      members,
      ownFlags: list.ownFlags,
      ownRoles: list.ownRoles,
      ownSubgroup: list.ownSubgroup,
    };
    const guids = new Set(members.map((member) => member.guid));
    for (const guid of this.stats.keys())
      if (!guids.has(guid)) this.stats.delete(guid);
    const after = new Set(members.map((member) => member.name));
    return {
      added: formed ? [] : [...after].filter((name) => !before.has(name)),
      formed,
      removed: [...before].filter((name) => !after.has(name)),
    };
  }

  applyLeader(name: string): void {
    if (this.state.inGroup) this.state.leader = name;
  }

  applyStats(guid: bigint, update: PartyMemberStats, now: number): void {
    const previous = this.stats.get(guid);
    this.stats.set(guid, {
      auras: update.auras ? [...update.auras] : (previous?.auras ?? []),
      health: update.hp ?? previous?.health ?? null,
      level: update.level ?? previous?.level ?? null,
      maxHealth: update.maxHp ?? previous?.maxHealth ?? null,
      maxPower: update.maxPower ?? previous?.maxPower ?? null,
      pet: mergePet(update.pet, previous?.pet ?? null),
      position: update.position
        ? { ...update.position }
        : (previous?.position ?? null),
      power: update.power ?? previous?.power ?? null,
      powerType: update.powerType ?? previous?.powerType ?? null,
      statsAt: now,
      vehicleSeat: update.vehicleSeat ?? previous?.vehicleSeat ?? null,
      zone: update.zone ?? previous?.zone ?? null,
    });
    const member = this.state.members.find((entry) => entry.guid === guid);
    if (member && update.online !== undefined) member.online = update.online;
  }

  clear(): void {
    this.state = emptyParty();
    this.stats.clear();
  }
}
