import { describe, expect, test } from "bun:test";
import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { petsHarness } from "#harness/areas/pets/area";
import { areaRuleSet, attachDrafts } from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
import { createMockGame } from "#test-support/mock-game";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type PetsEvent = AreaEventOf<"pets">;
type PetsState = AreaState<"pets">;
type Bar = Extract<PetsEvent, { type: "bar"; cleared: false }>["bar"];

const FANG = 0xf1_40_00_0c_82_00_01_b2n;
const RAVAGER = 0xf1_40_00_0c_82_00_01_b3n;
const WOLF = 1;

function input(over: Partial<RuleInput> = {}): RuleInput {
  return testRuleInput({
    lookup: testLookup({
      unitName: (guid) => (guid === FANG ? "Fang" : undefined),
    }),
    ...over,
  });
}

function bar(over: Partial<Bar> = {}): Bar {
  return {
    command: "follow",
    durationMs: 0,
    family: WOLF,
    flags: 0,
    guid: FANG,
    react: "defensive",
    receivedAt: 0,
    slots: [],
    spells: [],
    ...over,
  };
}

function barEvent(over: Partial<Bar> = {}): PetsEvent {
  return { bar: bar(over), cleared: false, type: "bar" };
}

const CLEARED: PetsEvent = { cleared: true, type: "bar" };

function rules() {
  const set = petsHarness.rules?.();
  if (!set?.event) throw new Error("pets has no event rule");
  const { attach, event } = set;
  const snapshot = event;
  return {
    attach: (barState: PetsState, rc: RuleInput = input()) =>
      attach?.(barState, rc) ?? [],
    event: (inner: PetsEvent, rc: RuleInput = input()): readonly AreaDraft[] =>
      snapshot(inner, rc),
  };
}

function state(current: Bar | undefined): PetsState {
  return {
    bar: current,
    comboPoints: undefined,
    cooldowns: [],
    lastRefusal: undefined,
    names: {},
    pet: undefined,
    renamePending: [],
    stable: undefined,
  };
}

describe("pets rules", () => {
  test("a bar with a new guid gives one out row naming the pet, its family, stance and command", () => {
    const [row, ...rest] = rules().event(barEvent());
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ class: "log", name: "out" });
    for (const value of ["Fang", "Wolf", "defensive", "follow"])
      expect(row?.text).toContain(value);
    expect(row?.guid).toBeDefined();
  });

  test("a second bar for the same pet, such as a stance change, gives no row", () => {
    const r = rules();
    r.event(barEvent());
    expect(r.event(barEvent({ react: "passive" }))).toEqual([]);
    expect(r.event(barEvent({ command: "stay" }))).toEqual([]);
  });

  test("a different pet guid gives a new out row", () => {
    const r = rules();
    r.event(barEvent());
    const rows = r.event(barEvent({ family: 31, guid: RAVAGER }));
    expect(rows.map((row) => row.name)).toEqual(["out"]);
    expect(rows.at(0)?.text).toContain("Ravager");
  });

  test("an unseen pet name and an unknown family still give a readable row", () => {
    const [row] = rules().event(barEvent({ family: 99, guid: RAVAGER }));
    for (const value of ["Your pet", "family 99", "defensive, follow"])
      expect(row?.text).toContain(value);
  });

  test("the clear gives one gone row, and a clear with no pet out gives none", () => {
    const r = rules();
    expect(r.event(CLEARED)).toEqual([]);
    r.event(barEvent());
    expect(r.event(CLEARED).map((row) => row.name)).toEqual(["gone"]);
    expect(r.event(CLEARED)).toEqual([]);
    expect(r.event(barEvent()).map((row) => row.name)).toEqual(["out"]);
  });

  test("attach with a pet already out gives one out row, and the first bar after it gives none", () => {
    const r = rules();
    const rows = r.attach(state(bar()));
    expect(rows.map((row) => row.name)).toEqual(["out"]);
    for (const value of ["Fang", "Wolf", "defensive", "follow"])
      expect(rows.at(0)?.text).toContain(value);
    expect(r.event(barEvent())).toEqual([]);
    expect(r.event(CLEARED).map((row) => row.name)).toEqual(["gone"]);
  });

  test("attach with no pet out writes no row and the first bar gives an out row", () => {
    const r = rules();
    expect(r.attach(state(undefined))).toEqual([]);
    expect(r.event(barEvent()).map((row) => row.name)).toEqual(["out"]);
  });

  test("the full registry logs one pets/out row at attach for the pet in play", () => {
    const game = createMockGame();
    const pets = game.pets as unknown as { state: () => PetsState };
    const current = pets.state();
    const withBar = Object.assign(createMockGame(), {
      pets: { ...game.pets, state: () => ({ ...current, bar: bar() }) },
    });
    const rows = attachDrafts(areaRuleSet(), withBar, input());
    const petRows = rows.filter((row) => row.domain === "pets");
    expect(petRows).toMatchObject([{ domain: "pets", event: "pets/out" }]);
    for (const value of ["Fang", "Wolf", "defensive", "follow"])
      expect(petRows.at(0)?.text).toContain(value);
  });

  test("feedback and a failed pet cast give one refused row each with the reason", () => {
    const r = rules();
    const feedback = r.event({ reason: "nothing_to_attack", type: "feedback" });
    expect(feedback.map((row) => row.name)).toEqual(["refused"]);
    expect(feedback.at(0)?.text).toContain("nothing to attack");
    expect(feedback.at(0)?.data).toMatchObject({ reason: "nothing_to_attack" });
    const cast = r.event({
      castCount: 1,
      reason: "not_ready",
      spell: 1742,
      type: "cast_failed",
    });
    expect(cast.map((row) => row.name)).toEqual(["refused"]);
    expect(cast.at(0)?.text).toContain("not_ready");
    expect(cast.at(0)?.text).toContain("spell 1742");
    expect(cast.at(0)?.data).toMatchObject({ reason: "not_ready" });
  });

  test("a silent cast failure writes no row", () => {
    const r = rules();
    expect(
      r.event({
        castCount: 1,
        reason: "dont_report",
        spell: 1742,
        type: "cast_failed",
      }),
    ).toEqual([]);
  });

  test("a learned spell gives one learned row and an unlearned spell gives none", () => {
    const r = rules();
    const learned = r.event({ spell: 1742, type: "spell_learned" });
    expect(learned.map((row) => row.name)).toEqual(["learned"]);
    expect(learned.at(0)?.data).toMatchObject({ spell: 1742 });
    expect(r.event({ spell: 1742, type: "spell_unlearned" })).toEqual([]);
  });

  test("a rename gives a renamed row, a bad name gives refused, a stable result gives a stable row and a silence gives unanswered", () => {
    const r = rules();
    const renamed = r.event({
      name: { name: "Fangtooth", number: 7, timestamp: 1 },
      type: "name",
    } as never);
    expect(renamed.map((row) => row.name)).toEqual(["renamed"]);
    expect(renamed.at(0)?.text).toContain("Fangtooth");
    const bad = r.event({
      declined: undefined,
      name: "Fangtooth",
      reason: "profane",
      type: "name_invalid",
    } as never);
    expect(bad.map((row) => row.name)).toEqual(["refused"]);
    expect(bad.at(0)?.text).toContain("profane");
    const failed = r.event({ code: 7, reason: "no_pet", type: "tame_failed" });
    expect(failed.map((row) => row.name)).toEqual(["refused"]);
    expect(failed.at(0)?.text).toContain("no pet");
    const stabled = r.event({
      code: 8,
      result: "stabled",
      type: "stable_result",
    });
    expect(stabled.map((row) => row.name)).toEqual(["stable"]);
    expect(stabled.at(0)?.text).toContain("stabled");
    const silent = r.event({ request: "rename", type: "unanswered" });
    expect(silent.map((row) => row.name)).toEqual(["unanswered"]);
    expect(silent.at(0)?.text).toContain("rename");
  });
});
