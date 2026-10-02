import { achievementsAllAchievementDataBody } from "#test-support/areas/achievements";
import { PacketWriter } from "#wow/protocol/packet";

export type SpecInit = {
  talents: readonly { talentId: number; rank: number }[];
  glyphs: readonly number[];
};
export type GearInit = {
  slot: number;
  entry: number;
  enchants?: Readonly<Record<number, number>>;
  randomProperty?: number;
  creator?: bigint;
  suffixFactor?: number;
};

function writeGear(w: PacketWriter, gear: readonly GearInit[]): void {
  const sorted = [...gear].sort((a, b) => a.slot - b.slot);
  let mask = 0;
  for (const item of sorted) mask |= 1 << item.slot;
  w.uint32LE(mask);
  for (const item of sorted) {
    w.uint32LE(item.entry);
    const enchants = Object.entries(item.enchants ?? {})
      .map(([slot, id]) => ({ id, slot: Number(slot) }))
      .sort((a, b) => a.slot - b.slot);
    let enchantMask = 0;
    for (const enchant of enchants) enchantMask |= 1 << enchant.slot;
    w.uint16LE(enchantMask);
    for (const enchant of enchants) w.uint16LE(enchant.id);
    w.uint16LE((item.randomProperty ?? 0) & 0xff_ff);
    w.packedGuidBig(item.creator ?? 0n);
    w.uint32LE(item.suffixFactor ?? 0);
  }
}

export function inspectInspectTalentBody(init: {
  guid: bigint;
  talents?: {
    freePoints: number;
    activeSpec: number;
    specs: readonly SpecInit[];
  };
  short?: boolean;
  gear: readonly GearInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  if (init.short || !init.talents) {
    w.uint32LE(0);
    w.uint8(0);
    w.uint8(0);
  } else {
    w.uint32LE(init.talents.freePoints);
    w.uint8(init.talents.specs.length);
    w.uint8(init.talents.activeSpec);
    for (const spec of init.talents.specs) {
      w.uint8(spec.talents.length);
      for (const talent of spec.talents) {
        w.uint32LE(talent.talentId);
        w.uint8(talent.rank);
      }
      w.uint8(spec.glyphs.length);
      for (const glyph of spec.glyphs) w.uint16LE(glyph);
    }
  }
  writeGear(w, init.gear);
  return w.finish();
}

export function inspectRespondInspectAchievementsBody(init: {
  guid: bigint;
  done: Parameters<typeof achievementsAllAchievementDataBody>[0]["done"];
  criteria: Parameters<
    typeof achievementsAllAchievementDataBody
  >[0]["criteria"];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.rawBytes(achievementsAllAchievementDataBody(init));
  return w.finish();
}
