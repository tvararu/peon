import type { SkillCatalog } from "#wow/areas/spells/skill-names";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export type Skill = {
  readonly id: number;
  readonly name: string;
  readonly step: number;
  readonly value: number;
  readonly max: number;
  readonly tempBonus: number;
  readonly permBonus: number;
};

export const SKILL_SLOTS = 128;

const SKILL_BASE = PLAYER_FIELDS.SKILL_INFO.offset;

function signed(n: number): number {
  return n >= 0x80_00 ? n - 0x1_00_00 : n;
}

export function readSkills(
  raw: ReadonlyMap<number, number> | undefined,
  catalog: SkillCatalog,
): Skill[] {
  if (!raw) return [];
  const skills: Skill[] = [];
  for (let slot = 0; slot < SKILL_SLOTS; slot++) {
    const word0 = raw.get(SKILL_BASE + slot * 3) ?? 0;
    const id = word0 & 0xff_ff;
    if (id === 0) continue;
    const word1 = raw.get(SKILL_BASE + slot * 3 + 1) ?? 0;
    const bonus = raw.get(SKILL_BASE + slot * 3 + 2) ?? 0;
    skills.push({
      id,
      max: (word1 >> 16) & 0xff_ff,
      name: catalog.nameOf(id),
      permBonus: signed((bonus >> 16) & 0xff_ff),
      step: (word0 >> 16) & 0xff_ff,
      tempBonus: signed(bonus & 0xff_ff),
      value: word1 & 0xff_ff,
    });
  }
  return skills;
}
