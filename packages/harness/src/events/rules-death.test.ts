import { describe, expect, test } from "bun:test";
import { type EntityEvent, ObjectType, type UnitEntity } from "@peon/core";
import type { Tap } from "#harness/events/rules";
import { deathDrafts, watchUnit } from "#harness/events/rules-death";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

function unit(guid: bigint, health: number): UnitEntity {
  return {
    class_: 1,
    displayId: 0,
    entry: 15_366,
    factionTemplate: 14,
    gender: 0,
    guid,
    health,
    level: 7,
    maxHealth: 137,
    maxPower: [],
    name: "Springpaw Stalker",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function hp(guid: bigint, health: number, changed = ["health"]): EntityEvent {
  return { changed, entity: unit(guid, health), type: "update" };
}

function input(tap: Tap | undefined, runActive = false) {
  return testRuleInput({
    lookup: testLookup({
      tapOf: () => tap,
      unitName: () => "Springpaw Stalker",
    }),
    runActive,
  });
}

describe("deathDrafts", () => {
  test("a watched unit killed by another player wakes the agent once", () => {
    const rc = input("other");
    watchUnit(0x11n, rc);
    expect(deathDrafts(hp(0x11n, 50), rc)).toEqual([]);
    expect(deathDrafts(hp(0x11n, 0), rc)).toEqual([
      {
        class: "wake",
        data: { by: "other", name: "Springpaw Stalker" },
        domain: "combat",
        event: "combat/target_died",
        guid: "11",
        ref: "u17",
        text: "Springpaw Stalker u17 died (killed by another player; no credit to you).",
      },
    ]);
    expect(deathDrafts(hp(0x11n, 0), rc)).toEqual([]);
  });

  test("an untapped death says only that no credit is coming", () => {
    const rc = input("none");
    watchUnit(0x11n, rc);
    const draft = deathDrafts(hp(0x11n, 0), rc)[0];
    expect(draft?.text).toContain("no credit to you");
    expect(draft?.text).not.toContain("killed by another player");
    expect(draft?.data).toMatchObject({ by: "none" });
    expect(draft?.event).toBe("combat/target_died");
  });

  test("our own tap, an unwatched unit or no health change gives no row", () => {
    const mine = input("mine");
    watchUnit(0x11n, mine);
    expect(deathDrafts(hp(0x11n, 0), mine)).toEqual([]);
    expect(deathDrafts(hp(0x12n, 0), input("other"))).toEqual([]);
    const moved = input("other");
    watchUnit(0x11n, moved);
    expect(deathDrafts(hp(0x11n, 0, ["position"]), moved)).toEqual([]);
  });

  test("while a run is active the row stays in the log", () => {
    const rc = input("other", true);
    watchUnit(0x11n, rc);
    expect(deathDrafts(hp(0x11n, 0), rc)[0]?.class).toBe("log");
  });

  test("a unit that leaves view is no longer watched", () => {
    const rc = input("other");
    watchUnit(0x11n, rc);
    expect(
      deathDrafts(
        { guid: 0x11n, name: "Springpaw Stalker", type: "disappear" },
        rc,
      ),
    ).toEqual([]);
    expect(deathDrafts(hp(0x11n, 0), rc)).toEqual([]);
  });

  test("never watches the character itself", () => {
    const rc = input("none");
    watchUnit(rc.selfGuid, rc);
    expect(deathDrafts(hp(rc.selfGuid, 0), rc)).toEqual([]);
  });
});
