import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { CombatEvent, ControlEvent, QuestEvent } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { combatDrafts } from "#harness/events/rules-combat";
import { controlDrafts } from "#harness/events/rules-world";
import { questDrafts } from "#harness/events/rules-world-quest";
import { XP_SOURCE_WAIT_MS } from "#harness/events/rules-xp";
import { routerSetup } from "#test-support/router-fixture";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();

function gained(total: number, at = 10): CombatEvent {
  const lastXp = { at, kind: "other" as const, total, victim: 0n };
  return { state: { ...handle.getCombatState(), lastXp }, type: "xp" };
}

function explored(areaId: number, area: string, xp: number): ControlEvent {
  return {
    explored: { area, areaId, xp },
    state: handle.getControlState(),
    type: "area_explored",
  };
}

function rewarded(experience: number): QuestEvent {
  const lastReward = {
    arenaPoints: 0,
    at: 0,
    experience,
    honor: 0,
    money: 0,
    questId: 8325,
    talents: 0,
  };
  return {
    questId: 8325,
    source: "packet",
    state: { ...handle.getQuestState(), lastReward },
    type: "rewarded",
  };
}

const levelled = testLookup({
  experience: () => ({ next: 400, xp: 100 }),
  questTitle: () => "Reclaiming Sunstrider Isle",
});

describe("xp/gain source", () => {
  test("exploration XP names the area and the total after the gain", () => {
    const rc = testRuleInput({ lookup: levelled });
    expect(combatDrafts(gained(63), rc)).toEqual([]);
    expect(controlDrafts(explored(3488, "Tranquillien", 63), rc)).toEqual([
      {
        class: "passive",
        data: {
          amount: 63,
          area: "Tranquillien",
          areaId: 3488,
          next: 400,
          source: "exploration",
          total: 163,
          victim: "0",
        },
        domain: "xp",
        event: "xp/gain",
        text: "You gain 63 XP (exploring Tranquillien, now 163 of 400).",
      },
    ]);
  });

  test("quest XP names the quest", () => {
    const rc = testRuleInput({ lookup: levelled });
    combatDrafts(gained(350), rc);
    const rows = questDrafts(rewarded(350), rc);
    expect(rows.map((row) => row.event)).toEqual(["quest/rewarded", "xp/gain"]);
    expect(rows[1]).toMatchObject({
      data: { levelUp: true, questId: 8325, source: "quest", total: 50 },
      text: "You gain 350 XP (quest Reclaiming Sunstrider Isle, level up, now 50).",
    });
  });
});

describe("xp/gain with no named source", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("is written as other once the source wait ends", () => {
    const { log, router } = routerSetup();
    const world = createMockHandle();
    router.attach(world);
    world.triggerCombatEvent(gained(40));
    expect(log.since(0).filter((row) => row.event === "xp/gain")).toEqual([]);
    jest.advanceTimersByTime(XP_SOURCE_WAIT_MS);
    expect(
      log.since(0).filter((row) => row.event === "xp/gain")[0],
    ).toMatchObject({ data: { amount: 40, source: "other" } });
  });
});
