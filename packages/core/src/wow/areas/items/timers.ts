import type {
  ItemCooldownPacket,
  ItemEnchantTimeUpdatePacket,
  ItemTimeUpdatePacket,
  SetProficiencyPacket,
} from "#wow/areas/items/protocol-timers";

export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;

export type ItemTimer = {
  itemGuid: bigint;
  seconds: number;
  seenAt: number;
  expiresAt: number;
};
export type EnchantTimer = ItemTimer & { slot: number };
export type ItemCooldown = { itemGuid: bigint; spell: number; seenAt: number };
export type ProficiencyMask = number | "unknown";
export type Proficiency = { weapon: ProficiencyMask; armor: ProficiencyMask };
export type ProficiencyKind = "weapon" | "armor";
export type ProficiencyChange = { kind: ProficiencyKind; added: number };
export type TimersState = {
  timers: ItemTimer[];
  enchants: EnchantTimer[];
  cooldowns: ItemCooldown[];
  proficiency: Proficiency;
};

const timer = (itemGuid: bigint, seconds: number, now: number): ItemTimer => ({
  itemGuid,
  seconds,
  seenAt: now,
  expiresAt: now + seconds * 1000,
});

export class TimerSlice {
  private readonly timers = new Map<bigint, ItemTimer>();
  private readonly enchants = new Map<string, EnchantTimer>();
  private readonly cooldowns = new Map<string, ItemCooldown>();
  private weapon: ProficiencyMask = "unknown";
  private armor: ProficiencyMask = "unknown";

  time({ itemGuid, seconds }: ItemTimeUpdatePacket, now: number): ItemTimer {
    const entry = timer(itemGuid, seconds, now);
    this.timers.set(itemGuid, entry);
    return entry;
  }

  enchant(
    { itemGuid, slot, seconds }: ItemEnchantTimeUpdatePacket,
    now: number,
  ): EnchantTimer {
    const entry = { ...timer(itemGuid, seconds, now), slot };
    this.enchants.set(`${itemGuid}:${slot}`, entry);
    return entry;
  }

  cooldown({ itemGuid, spell }: ItemCooldownPacket, now: number): ItemCooldown {
    const key = `${itemGuid}:${spell}`;
    const entry = { itemGuid, spell, seenAt: now };
    this.cooldowns.set(key, entry);
    return entry;
  }

  proficiency({
    itemClass,
    mask,
  }: SetProficiencyPacket): ProficiencyChange | undefined {
    if (itemClass === ITEM_CLASS_WEAPON) {
      const added = newBits(this.weapon, mask);
      this.weapon = mask;
      return { kind: "weapon", added };
    }
    if (itemClass === ITEM_CLASS_ARMOR) {
      const added = newBits(this.armor, mask);
      this.armor = mask;
      return { kind: "armor", added };
    }
    return undefined;
  }

  snapshot(): TimersState {
    return {
      timers: [...this.timers.values()],
      enchants: [...this.enchants.values()],
      cooldowns: [...this.cooldowns.values()],
      proficiency: { weapon: this.weapon, armor: this.armor },
    };
  }

  clear(): void {
    this.timers.clear();
    this.enchants.clear();
    this.cooldowns.clear();
    this.weapon = "unknown";
    this.armor = "unknown";
  }
}

function newBits(before: ProficiencyMask, mask: number): number {
  return (before === "unknown" ? mask : mask & ~before) >>> 0;
}

const WEAPON_SKILLS: Record<number, string> = {
  0: "one-handed axes",
  1: "two-handed axes",
  2: "bows",
  3: "guns",
  4: "one-handed maces",
  5: "two-handed maces",
  6: "polearms",
  7: "one-handed swords",
  8: "two-handed swords",
  10: "staves",
  13: "fist weapons",
  15: "daggers",
  16: "thrown weapons",
  18: "crossbows",
  19: "wands",
  20: "fishing poles",
};
const ARMOR_SKILLS: Record<number, string> = {
  1: "cloth",
  2: "leather",
  3: "mail",
  4: "plate",
  6: "shields",
  7: "librams",
  8: "idols",
  9: "totems",
  10: "sigils",
};

export function proficiencyNames(
  kind: ProficiencyKind,
  bits: number,
): string[] {
  const table = kind === "weapon" ? WEAPON_SKILLS : ARMOR_SKILLS;
  const names: string[] = [];
  for (let subclass = 0; subclass < 32; subclass++)
    if (bits & (1 << subclass))
      names.push(table[subclass] ?? `subclass ${subclass}`);
  return names;
}
