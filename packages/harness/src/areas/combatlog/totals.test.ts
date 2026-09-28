import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { fightText, sumsSince } from "#harness/areas/combatlog/totals";

type Entry = AreaState<"combatlog">["entries"][number];

const ME = 0x2an;
const PET = 0xf1_40_00_0c_82_00_01_b2n;
const BOAR = 0xf1_30_00_0c_1a_00_0a_bcn;
const MATE = 0x2bn;

const ours = (guid: bigint) => guid === ME || guid === PET;

function entry(over: Partial<Entry>): Entry {
  return {
    amount: 0,
    at: 100,
    kind: "melee",
    source: ME,
    target: BOAR,
    ...over,
  };
}

describe("sumsSince", () => {
  test("sums what the character and its pet dealt, took and healed since the start", () => {
    const sums = sumsSince(
      [
        entry({ amount: 999, at: 99 }),
        entry({ amount: 10 }),
        entry({ amount: 5, source: PET }),
        entry({ amount: 21, kind: "spell_damage", spellId: 133 }),
        entry({ amount: 7, source: BOAR, target: ME }),
        entry({ amount: 4, kind: "periodic_damage", source: BOAR, target: ME }),
        entry({ amount: 30, kind: "heal", source: MATE, target: ME }),
        entry({ amount: 8, kind: "heal", source: ME, target: BOAR }),
        entry({ amount: 50, source: MATE, target: BOAR }),
        entry({ amount: 0, kind: "kill", source: ME }),
      ],
      100,
      ME,
      ours,
    );
    expect(sums).toMatchObject({ dealt: 36, healed: 30, taken: 11 });
  });

  test("avoided counts our misses and the target's dodges, parries and blocks, not our own dodges", () => {
    const sums = sumsSince(
      [
        entry({ outcome: "miss" }),
        entry({ outcome: "dodge" }),
        entry({ outcome: "dodge", source: PET }),
        entry({ outcome: "parry" }),
        entry({ amount: 3, outcome: "block" }),
        entry({ amount: 3, outcome: "resist" }),
        entry({ outcome: "dodge", source: BOAR, target: ME }),
        entry({ outcome: "dodge", source: MATE, target: BOAR }),
      ],
      0,
      ME,
      ours,
    );
    expect(sums.avoided).toEqual({ block: 1, dodge: 2, miss: 1, parry: 1 });
  });

  test("immune lists each refused spell of the character once, in order", () => {
    const sums = sumsSince(
      [
        entry({ kind: "immune", spellId: 122 }),
        entry({ kind: "miss", outcome: "immune2", spellId: 5143 }),
        entry({ kind: "immune", spellId: 122 }),
        entry({ kind: "immune", spellId: 0 }),
        entry({ outcome: "immune" }),
        entry({ kind: "immune", source: BOAR, spellId: 133, target: ME }),
        entry({ at: 5, kind: "immune", spellId: 8921 }),
      ],
      10,
      ME,
      ours,
    );
    expect(sums.immune).toEqual([122, 5143]);
    expect(sums.immuneCount).toBe(3);
  });
});

describe("fightText", () => {
  test("names dealt, taken and the misses of the fight", () => {
    expect(
      fightText({
        dealt: 312,
        healed: 0,
        misses: { dodge: 1, resist: 1 },
        taken: 145,
      }),
    ).toBe("Fight over: dealt 312, took 145 (1 dodge, 1 resist).");
  });

  test("leaves the brackets out with no misses and adds healing when there was some", () => {
    expect(fightText({ dealt: 20, healed: 15, misses: {}, taken: 0 })).toBe(
      "Fight over: dealt 20, took 0, healed 15.",
    );
  });

  test("pluralises counts above one", () => {
    expect(
      fightText({
        dealt: 1,
        healed: 0,
        misses: { dodge: 2, miss: 3 },
        taken: 1,
      }),
    ).toBe("Fight over: dealt 1, took 1 (2 dodges, 3 misses).");
  });
});
