import type { ItemSpell, ItemTemplate } from "#wow/protocol/item";
import { PacketWriter } from "#wow/protocol/packet";

const ITEM_SPELL_SLOTS = 5;
const NO_COOLDOWN = 0xff_ff_ff_ff;

type WireOnly = {
  soundOverride: number;
  names: readonly [string, string, string];
  displayId: number;
  flags2: number;
  buyPrice: number;
  sellPrice: number;
  honorRank: number;
  cityRank: number;
  reputationFaction: number;
  reputationRank: number;
  scalingDistribution: number;
  scalingValue: number;
  rangedModRange: number;
  description: string;
  language: number;
  pageMaterial: number;
  startQuest: number;
  material: number;
  sheath: number;
  randomProperty: number;
  randomSuffix: number;
  block: number;
  area: number;
  map: number;
  totemCategory: number;
  disenchantSkill: number;
  armorDamageModifier: number;
  holiday: number;
};

const WIRE_DEFAULTS: WireOnly = {
  area: 0,
  armorDamageModifier: 0,
  block: 0,
  buyPrice: 0,
  cityRank: 0,
  description: "",
  disenchantSkill: 0,
  displayId: 0,
  flags2: 0,
  holiday: 0,
  honorRank: 0,
  language: 0,
  map: 0,
  material: 0,
  names: ["", "", ""],
  pageMaterial: 0,
  randomProperty: 0,
  randomSuffix: 0,
  rangedModRange: 0,
  reputationFaction: 0,
  reputationRank: 0,
  scalingDistribution: 0,
  scalingValue: 0,
  sellPrice: 0,
  sheath: 0,
  soundOverride: -1,
  startQuest: 0,
  totemCategory: 0,
};

function words(w: PacketWriter, values: readonly number[]) {
  for (const value of values) w.uint32LE(value >>> 0);
}

function writeSpells(w: PacketWriter, spells: readonly ItemSpell[]) {
  for (let slot = 0; slot < ITEM_SPELL_SLOTS; slot++) {
    const spell = spells[slot];
    if (!spell) {
      words(w, [0, 0, 0, NO_COOLDOWN, 0, NO_COOLDOWN]);
      continue;
    }
    words(w, [
      spell.id,
      spell.trigger,
      spell.charges,
      spell.cooldownMs,
      spell.category,
      spell.categoryCooldownMs,
    ]);
  }
}

export function itemsItemQuerySingleResponseBody(
  template: ItemTemplate,
  wire: Partial<WireOnly> = {},
): Uint8Array {
  const t = template;
  const x = { ...WIRE_DEFAULTS, ...wire };
  const w = new PacketWriter();
  words(w, [t.entry, t.itemClass, t.subclass, x.soundOverride]);
  w.cString(t.name);
  for (const name of x.names) w.cString(name);
  words(w, [x.displayId, t.quality, t.flags, x.flags2, x.buyPrice]);
  words(w, [x.sellPrice, t.inventoryType, t.allowableClass, t.allowableRace]);
  words(w, [t.itemLevel, t.requiredLevel, t.requiredSkill]);
  words(w, [t.requiredSkillRank, t.requiredSpell, x.honorRank, x.cityRank]);
  words(w, [x.reputationFaction, x.reputationRank, t.maxCount, t.stackSize]);
  words(w, [t.containerSlots, t.stats.length]);
  for (const stat of t.stats) words(w, [stat.type, stat.value]);
  words(w, [x.scalingDistribution, x.scalingValue]);
  for (const damage of t.damage) {
    w.floatLE(damage.min);
    w.floatLE(damage.max);
    w.uint32LE(damage.school);
  }
  const res = t.resistances;
  words(w, [t.armor, res.holy, res.fire, res.nature, res.frost]);
  words(w, [res.shadow, res.arcane, t.delay, t.ammoType]);
  w.floatLE(x.rangedModRange);
  writeSpells(w, t.spells);
  w.uint32LE(t.bonding);
  w.cString(x.description);
  words(w, [t.pageText, x.language, x.pageMaterial, x.startQuest, t.lockId]);
  words(w, [x.material, x.sheath, x.randomProperty, x.randomSuffix, x.block]);
  words(w, [t.itemSet, t.maxDurability, x.area, x.map, t.bagFamily]);
  w.uint32LE(x.totemCategory);
  for (const socket of t.sockets) words(w, [socket.color, socket.content]);
  words(w, [t.socketBonus, t.gemProperties, x.disenchantSkill]);
  w.floatLE(x.armorDamageModifier);
  words(w, [t.duration, t.limitCategory, x.holiday]);
  return w.finish();
}

export type EquipErrorInit = {
  result: number;
  item1?: bigint;
  item2?: bigint;
  requiredLevel?: number;
  limitCategory?: number;
};

const CANT_EQUIP_LEVEL = 1;
const BIND_CONFIRM = 81;
const PURCHASE_LEVEL_TOO_LOW = 87;
const LIMIT_RESULTS = new Set([84, 85, 89]);

export function itemsInventoryChangeFailureBody(
  init: EquipErrorInit,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.result);
  if (init.result === 0) return w.finish();
  w.uint64LE(init.item1 ?? 0n);
  w.uint64LE(init.item2 ?? 0n);
  w.uint8(0);
  if (
    init.result === CANT_EQUIP_LEVEL ||
    init.result === PURCHASE_LEVEL_TOO_LOW
  )
    w.uint32LE(init.requiredLevel ?? 0);
  if (init.result === BIND_CONFIRM) {
    w.uint64LE(0n);
    w.uint32LE(0);
    w.uint64LE(0n);
  }
  if (LIMIT_RESULTS.has(init.result)) w.uint32LE(init.limitCategory ?? 0);
  return w.finish();
}

export function itemsTemplate(init: Partial<ItemTemplate>): ItemTemplate {
  return {
    allowableClass: 0xff_ff_ff_ff,
    allowableRace: 0xff_ff_ff_ff,
    ammoType: 0,
    armor: 0,
    bagFamily: 0,
    bonding: 0,
    containerSlots: 0,
    damage: [],
    delay: 1900,
    duration: 0,
    entry: 25,
    flags: 0,
    gemProperties: 0,
    inventoryType: 21,
    itemClass: 2,
    itemLevel: 2,
    itemSet: 0,
    limitCategory: 0,
    lockId: 0,
    maxCount: 0,
    maxDurability: 20,
    name: "Worn Shortsword",
    pageText: 0,
    quality: 1,
    requiredLevel: 1,
    requiredSkill: 0,
    requiredSkillRank: 0,
    requiredSpell: 0,
    resistances: {
      arcane: 0,
      fire: 0,
      frost: 0,
      holy: 0,
      nature: 0,
      shadow: 0,
    },
    socketBonus: 0,
    sockets: [],
    spells: [],
    stackSize: 1,
    stats: [],
    subclass: 7,
    ...init,
  };
}
