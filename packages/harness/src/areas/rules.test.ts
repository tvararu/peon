import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import {
  areaDrafts,
  areaRuleSet,
  attachDrafts,
  fallbackDraft,
} from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

type FixtureEvent = { readonly type: string } & Record<string, unknown>;

function areaEvent(area: string, event: FixtureEvent): AreaEvent {
  return { area, event } as never;
}

const synced = (name: string): AreaDraft => ({
  class: "passive",
  data: { speed: 0.01 },
  name,
  progress: true,
  ref: "u1",
  text: "Server time synced.",
});

const REGISTRY = {
  alpha: {
    area: "alpha",
    rules: () => ({
      attach: (state: { speed: number }, rc: RuleInput) => [
        { ...synced("synced"), data: { now: rc.now, speed: state.speed } },
      ],
      event: (event: FixtureEvent) =>
        event.type === "flood" ? [] : [synced(event.type)],
    }),
  },
  beta: { area: "beta" },
};

describe("area rules", () => {
  test("an event with no rule becomes one quiet fallback row", () => {
    const event = areaEvent("beta", {
      guid: 0x1234n,
      nested: { skip: true },
      ok: true,
      speed: 0.0166,
      type: "synced",
      when: "now",
    });
    const want = {
      class: "log",
      data: {
        fallback: true,
        guid: "4660",
        ok: true,
        speed: 0.0166,
        type: "synced",
        when: "now",
      },
      domain: "beta",
      event: "beta/synced",
      text: "beta synced",
    };
    expect<unknown>(fallbackDraft(event)).toEqual(want);
    const rules = areaRuleSet(REGISTRY);
    expect<unknown[]>(areaDrafts(rules, event, testRuleInput())).toEqual([
      want,
    ]);
    expect<unknown[]>(
      areaDrafts(areaRuleSet(), event, testRuleInput()),
    ).toEqual([want]);
  });

  test("an event rule replaces the fallback row", () => {
    const rows = areaDrafts(
      areaRuleSet(REGISTRY),
      areaEvent("alpha", { type: "synced" }),
      testRuleInput(),
    );
    expect<unknown[]>(rows).toEqual([
      {
        class: "passive",
        data: { speed: 0.01 },
        domain: "alpha",
        event: "alpha/synced",
        progress: true,
        ref: "u1",
        text: "Server time synced.",
      },
    ]);
  });

  test("a rule that returns no drafts writes no row", () => {
    const flood = areaEvent("alpha", { type: "flood" });
    expect(areaDrafts(areaRuleSet(REGISTRY), flood, testRuleInput())).toEqual(
      [],
    );
  });

  test("a draft name that is not snake_case throws", () => {
    const rules = areaRuleSet(REGISTRY);
    for (const type of ["Synced", "time/synced", "synced1", ""])
      expect(() =>
        areaDrafts(rules, areaEvent("alpha", { type }), testRuleInput()),
      ).toThrow("area draft name");
  });

  test("attach rules read the area's state from the handle", () => {
    const game = Object.assign(createMockGame(), {
      alpha: { state: () => ({ speed: 0.02 }) },
      beta: { state: () => ({ speed: 1 }) },
    });
    const rows = attachDrafts(
      areaRuleSet(REGISTRY),
      game,
      testRuleInput({ now: 42 }),
    );
    expect<unknown[]>(rows).toEqual([
      {
        class: "passive",
        data: { now: 42, speed: 0.02 },
        domain: "alpha",
        event: "alpha/synced",
        progress: true,
        ref: "u1",
        text: "Server time synced.",
      },
    ]);
    expect(attachDrafts(areaRuleSet(), game, testRuleInput())).toEqual([]);
  });
});
