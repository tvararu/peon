import { describe, expect, test } from "bun:test";
import {
  BLOOD_ELF_MASK,
  MAGE_MASK,
  REPUTATION_FACTIONS,
  reputationDbcSource,
  WARLOCK_MASK,
} from "#test-support/areas/reputation";
import {
  loadFactionCatalog,
  RANK_NAMES,
  rankBounds,
  rankOf,
} from "#wow/areas/reputation/catalog";

const catalog = () =>
  loadFactionCatalog(reputationDbcSource(REPUTATION_FACTIONS));

describe("faction catalog", () => {
  test("finds a faction by list id and by id; -1 is no list id (DBCStructure.h:942-958)", async () => {
    const factions = await catalog();
    expect(factions.byRepListId(14)?.id).toBe(911);
    expect(factions.byFactionId(911)?.name).toBe("Silvermoon City");
    expect(factions.byFactionId(911)?.repListId).toBe(14);
    expect(factions.byFactionId(589)?.repListId).toBeUndefined();
    expect(factions.byRepListId(15)).toBeUndefined();
  });

  test("base reputation takes the first matching slot (ReputationMgr.cpp:91-111)", async () => {
    const factions = await catalog();
    const silvermoon = factions.byFactionId(911);
    if (!silvermoon) throw new Error("fixture");
    expect(factions.baseReputation(silvermoon, BLOOD_ELF_MASK, MAGE_MASK)).toBe(
      3000,
    );
    expect(factions.baseReputation(silvermoon, 1 << 1, WARLOCK_MASK)).toBe(400);
    expect(factions.baseReputation(silvermoon, 1 << 4, MAGE_MASK)).toBe(
      -42_000,
    );
    expect(factions.baseReputation(silvermoon, 1, MAGE_MASK)).toBe(0);
  });

  test("only a faction every race starts in can be set at war (DBCStructure.h:965-968)", async () => {
    const factions = await catalog();
    const at = (id: number) => {
      const faction = factions.byFactionId(id);
      return faction ? factions.canBeSetAtWar(faction) : undefined;
    };
    expect(at(87)).toBe(true);
    expect(at(911)).toBe(false);
    expect(at(589)).toBe(false);
  });

  test("ranks follow ReputationToRank (ReputationMgr.cpp:28-42)", () => {
    expect(rankOf(-42_000)).toBe(0);
    expect(rankOf(-6001)).toBe(0);
    expect(rankOf(-6000)).toBe(1);
    expect(rankOf(-1)).toBe(2);
    expect(rankOf(0)).toBe(3);
    expect(rankOf(3000)).toBe(4);
    expect(rankOf(41_999)).toBe(6);
    expect(rankOf(42_999)).toBe(7);
    expect(RANK_NAMES[rankOf(3000)]).toBe("Friendly");
    expect(rankBounds(0)).toEqual({ ceiling: -6001, floor: -42_000 });
    expect(rankBounds(3)).toEqual({ ceiling: 2999, floor: 0 });
    expect(rankBounds(7)).toEqual({ ceiling: 42_999, floor: 42_000 });
  });
});
