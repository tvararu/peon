import { describe, expect, test } from "bun:test";
import { spellsSkillFields } from "#test-support/areas/spells";
import { STATIC_SKILL_CATALOG } from "#wow/areas/spells/skill-names";
import { readSkills } from "#wow/areas/spells/skills";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

const MINING = 186;
const SWORDS = 43;

describe("readSkills", () => {
  test("reads id, step, value, max and both signed bonuses from the triples", () => {
    const raw = spellsSkillFields([
      { id: MINING, max: 75, perm: 0, step: 1, temp: 0, value: 12 },
      { id: SWORDS, max: 300, perm: -2, step: 0, temp: 5, value: 100 },
    ]);
    expect(readSkills(raw, STATIC_SKILL_CATALOG)).toEqual([
      {
        id: MINING,
        max: 75,
        name: "Mining",
        permBonus: 0,
        profession: true,
        step: 1,
        tempBonus: 0,
        value: 12,
      },
      {
        id: SWORDS,
        max: 300,
        name: `skill ${SWORDS}`,
        permBonus: -2,
        profession: false,
        step: 0,
        tempBonus: 5,
        value: 100,
      },
    ]);
  });

  test("marks primary and secondary professions, not weapons or racials", () => {
    const raw = spellsSkillFields(
      [186, 185, 43, 54, 101, 356, 762].map((id) => ({
        id,
        max: 75,
        perm: 0,
        step: 1,
        temp: 0,
        value: 10,
      })),
    );
    expect(
      readSkills(raw, STATIC_SKILL_CATALOG).map((skill) => [
        skill.id,
        skill.profession,
      ]),
    ).toEqual([
      [186, true],
      [185, true],
      [43, false],
      [54, false],
      [101, false],
      [356, true],
      [762, false],
    ]);
  });
  test("skips empty slots and reads past them", () => {
    const raw = spellsSkillFields([
      { id: 0, max: 0, perm: 0, step: 0, temp: 0, value: 0 },
      { id: MINING, max: 75, perm: 0, step: 0, temp: 0, value: 1 },
    ]);
    expect(readSkills(raw, STATIC_SKILL_CATALOG).map((s) => s.id)).toEqual([
      MINING,
    ]);
  });

  test("reads the last of the 128 slots and nothing beyond it", () => {
    const raw = new Map<number, number>();
    const base = PLAYER_FIELDS.SKILL_INFO.offset;
    raw.set(base + 127 * 3, MINING);
    raw.set(base + 127 * 3 + 1, (75 << 16) | 3);
    raw.set(base + 128 * 3, SWORDS);
    const skills = readSkills(raw, STATIC_SKILL_CATALOG);
    expect(skills.map((s) => [s.id, s.value, s.max])).toEqual([
      [MINING, 3, 75],
    ]);
  });

  test("no fields read as no skills", () => {
    expect(readSkills(undefined, STATIC_SKILL_CATALOG)).toEqual([]);
    expect(readSkills(new Map(), STATIC_SKILL_CATALOG)).toEqual([]);
  });
});
