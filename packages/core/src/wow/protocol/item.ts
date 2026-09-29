import { type PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  type SpellTarget,
  writeSpellTargets,
} from "#wow/protocol/spell-targets";

export const ItemSpellTrigger = { ON_USE: 0 } as const;

const ITEM_SPELL_SLOTS = 5;
const ITEM_DAMAGES = 2;
const ITEM_SOCKETS = 3;
const UNLIMITED_STACK = 0x7f_ff_ff_ff;
const WORD = 4;
const FLAGS2_AND_PRICES = 3;
const HONOR_CITY_AND_REPUTATION = 4;
const SCALING = 2;
const RANGED_MOD_RANGE = 1;
const LANGUAGE_TO_START_QUEST = 3;
const MATERIAL_TO_BLOCK = 5;
const AREA_AND_MAP = 2;
const TOTEM_CATEGORY = 1;
const DISENCHANT_AND_ARMOR_MODIFIER = 2;
const HOLIDAY = 1;

export type ItemSpell = {
  id: number;
  trigger: number;
  charges: number;
  cooldownMs: number;
  category: number;
  categoryCooldownMs: number;
};

export type ItemStat = { type: number; value: number };

export type ItemDamage = { min: number; max: number; school: number };

export type ItemResistances = {
  holy: number;
  fire: number;
  nature: number;
  frost: number;
  shadow: number;
  arcane: number;
};

export type ItemSocket = { color: number; content: number };

type ItemHead = {
  entry: number;
  name: string;
  quality: number;
  itemClass: number;
  subclass: number;
  stackSize: number;
  spells: ItemSpell[];
  flags: number;
};

type ItemRequirements = {
  inventoryType: number;
  allowableClass: number;
  allowableRace: number;
  itemLevel: number;
  requiredLevel: number;
  requiredSkill: number;
  requiredSkillRank: number;
  requiredSpell: number;
  maxCount: number;
  containerSlots: number;
};

type ItemCombat = {
  stats: ItemStat[];
  damage: ItemDamage[];
  armor: number;
  resistances: ItemResistances;
  delay: number;
  ammoType: number;
};

type ItemTail = {
  bonding: number;
  pageText: number;
  lockId: number;
  itemSet: number;
  maxDurability: number;
  bagFamily: number;
  sockets: ItemSocket[];
  socketBonus: number;
  gemProperties: number;
  duration: number;
  limitCategory: number;
};

export type ItemTemplate = ItemHead & ItemRequirements & ItemCombat & ItemTail;

export type ItemQueryResponse = {
  entry: number;
  template: ItemTemplate | undefined;
};

export type ItemUseRequest = {
  bag: number;
  slot: number;
  castCount: number;
  spellId: number;
  itemGuid: bigint;
  target?: SpellTarget;
};

export function buildItemQuery(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  return w.finish();
}

function skipWords(r: PacketReader, count: number) {
  r.skip(count * WORD);
}

function readRequirements(r: PacketReader) {
  const inventoryType = r.uint32LE();
  const allowableClass = r.uint32LE();
  const allowableRace = r.uint32LE();
  const itemLevel = r.uint32LE();
  const requiredLevel = r.uint32LE();
  const requiredSkill = r.uint32LE();
  const requiredSkillRank = r.uint32LE();
  const requiredSpell = r.uint32LE();
  skipWords(r, HONOR_CITY_AND_REPUTATION);
  const maxCount = r.int32LE();
  const stackable = r.int32LE();
  const containerSlots = r.uint32LE();
  const requirements: ItemRequirements = {
    inventoryType,
    allowableClass,
    allowableRace,
    itemLevel,
    requiredLevel,
    requiredSkill,
    requiredSkillRank,
    requiredSpell,
    maxCount,
    containerSlots,
  };
  return {
    requirements,
    stackSize: stackable > 0 ? stackable : UNLIMITED_STACK,
  };
}

function readCombat(r: PacketReader): ItemCombat {
  const stats: ItemStat[] = [];
  const statCount = r.uint32LE();
  for (let i = 0; i < statCount; i++) {
    stats.push({ type: r.uint32LE(), value: r.int32LE() });
  }
  skipWords(r, SCALING);
  const damage: ItemDamage[] = [];
  for (let i = 0; i < ITEM_DAMAGES; i++) {
    damage.push({ min: r.floatLE(), max: r.floatLE(), school: r.uint32LE() });
  }
  const armor = r.uint32LE();
  const resistances = {
    holy: r.int32LE(),
    fire: r.int32LE(),
    nature: r.int32LE(),
    frost: r.int32LE(),
    shadow: r.int32LE(),
    arcane: r.int32LE(),
  };
  const delay = r.uint32LE();
  const ammoType = r.uint32LE();
  skipWords(r, RANGED_MOD_RANGE);
  return { stats, damage, armor, resistances, delay, ammoType };
}

function readSpells(r: PacketReader): ItemSpell[] {
  const spells: ItemSpell[] = [];
  for (let i = 0; i < ITEM_SPELL_SLOTS; i++) {
    const spell = {
      id: r.uint32LE(),
      trigger: r.uint32LE(),
      charges: r.int32LE(),
      cooldownMs: r.int32LE(),
      category: r.uint32LE(),
      categoryCooldownMs: r.int32LE(),
    };
    if (spell.id !== 0) spells.push(spell);
  }
  return spells;
}

function readTail(r: PacketReader): ItemTail {
  const bonding = r.uint32LE();
  r.cString();
  const pageText = r.uint32LE();
  skipWords(r, LANGUAGE_TO_START_QUEST);
  const lockId = r.uint32LE();
  skipWords(r, MATERIAL_TO_BLOCK);
  const itemSet = r.uint32LE();
  const maxDurability = r.uint32LE();
  skipWords(r, AREA_AND_MAP);
  const bagFamily = r.uint32LE();
  skipWords(r, TOTEM_CATEGORY);
  const sockets: ItemSocket[] = [];
  for (let i = 0; i < ITEM_SOCKETS; i++) {
    sockets.push({ color: r.uint32LE(), content: r.uint32LE() });
  }
  const socketBonus = r.uint32LE();
  const gemProperties = r.uint32LE();
  skipWords(r, DISENCHANT_AND_ARMOR_MODIFIER);
  const duration = r.uint32LE();
  const limitCategory = r.uint32LE();
  skipWords(r, HOLIDAY);
  return {
    bonding,
    pageText,
    lockId,
    itemSet,
    maxDurability,
    bagFamily,
    sockets,
    socketBonus,
    gemProperties,
    duration,
    limitCategory,
  };
}

export function parseItemQueryResponse(r: PacketReader): ItemQueryResponse {
  const raw = r.uint32LE();
  const entry = raw & 0x7f_ff_ff_ff;
  if (raw & 0x80_00_00_00) return { entry, template: undefined };
  const itemClass = r.uint32LE();
  const subclass = r.uint32LE();
  r.skip(WORD);
  const name = r.cString();
  for (let i = 0; i < 3; i++) r.cString();
  r.skip(WORD);
  const quality = r.uint32LE();
  const flags = r.uint32LE();
  skipWords(r, FLAGS2_AND_PRICES);
  const { requirements, stackSize } = readRequirements(r);
  const combat = readCombat(r);
  const spells = readSpells(r);
  const tail = readTail(r);
  return {
    entry,
    template: {
      entry,
      name,
      quality,
      itemClass,
      subclass,
      stackSize,
      spells,
      flags,
      ...requirements,
      ...combat,
      ...tail,
    },
  };
}

export function buildUseItem(request: ItemUseRequest): Uint8Array {
  const w = new PacketWriter();
  w.uint8(request.bag);
  w.uint8(request.slot);
  w.uint8(request.castCount);
  w.uint32LE(request.spellId);
  w.uint64LE(request.itemGuid);
  w.uint32LE(0);
  w.uint8(0);
  writeSpellTargets(w, request.target ?? { kind: "none" });
  return w.finish();
}
