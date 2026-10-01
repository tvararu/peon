import { describe, expect, test } from "bun:test";
import type { AreaEventOf, AreaState } from "@peon/core";
import { ambienceHarness } from "#harness/areas/ambience/area";
import type { AreaDraft } from "#harness/areas/contract";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

type AmbienceEvent = AreaEventOf<"ambience">;

function rules() {
  const event = ambienceHarness.rules?.().event;
  if (!event) throw new Error("ambience has no event rule");
  return (
    e: AmbienceEvent,
    rc: RuleInput = testRuleInput(),
  ): readonly AreaDraft[] => event(e, rc);
}

describe("ambience/cinematic", () => {
  test("a completed cinematic explains the skipped intro", () => {
    expect(
      rules()({
        cinematic: { at: 1_000_000, completed: true, sequenceId: 84 },
        previous: undefined,
        type: "cinematic",
      }),
    ).toEqual([
      {
        class: "passive",
        data: { sequenceId: 84 },
        name: "cinematic",
        text: "The intro cinematic started; Peon skipped it.",
      },
    ]);
  });
});

describe("ambience/movie", () => {
  test("a movie the server started is a passive row", () => {
    expect(
      rules()({
        movie: { at: 1_000_000, movieId: 14 },
        previous: undefined,
        type: "movie",
      }),
    ).toEqual([
      {
        class: "passive",
        data: { movieId: 14 },
        name: "movie",
        text: "The server started movie 14; Peon cannot show it.",
      },
    ]);
  });

  test("the movie row is passive inside a run", () => {
    const [row] = rules()(
      {
        movie: { at: 1_000_000, movieId: 14 },
        previous: undefined,
        type: "movie",
      },
      testRuleInput({ runActive: true }),
    );
    expect(row?.class).toBe("passive");
  });
});

describe("ambience/phase", () => {
  test("a phase change is a log row with the plan text", () => {
    expect(rules()({ from: 1, to: 2, type: "phase_changed" })).toEqual([
      {
        class: "log",
        data: { from: 1, to: 2 },
        name: "phase",
        text: "Your phase changed. Some units and objects may appear or vanish.",
      },
    ]);
  });

  test("sound and light write nothing, also inside a run", () => {
    const quiet: AmbienceEvent[] = [
      { kind: "sound", soundKitId: 1, source: "", type: "sound" },
      { kind: "music", soundKitId: 2, source: "", type: "sound" },
      { kind: "object", soundKitId: 3, source: "99", type: "sound" },
      {
        light: { at: 1, defaultId: 1, fadeMs: 0, overrideId: 2 },
        type: "light",
      },
    ];
    for (const runActive of [false, true])
      for (const event of quiet)
        expect(
          areaDrafts(
            areaRuleSet(),
            { area: "ambience", event },
            testRuleInput({ runActive }),
          ),
        ).toEqual([]);
  });
});

describe("ambience flood guard", () => {
  test("world_state, weather and a cinematic that did not complete write nothing", () => {
    const set = areaRuleSet();
    const quiet: AmbienceEvent[] = [
      { id: 2014, previous: 0, type: "world_state", value: 1 },
      {
        previous: undefined,
        type: "weather",
        weather: { abrupt: false, intensity: 1, state: 3 },
      },
      {
        cinematic: { at: 1_000_000, completed: false, sequenceId: 84 },
        previous: undefined,
        type: "cinematic",
      },
    ];
    for (const runActive of [false, true])
      for (const event of quiet)
        expect(
          areaDrafts(
            set,
            { area: "ambience", event },
            testRuleInput({ runActive }),
          ),
        ).toEqual([]);
  });

  test("the router names each row ambience/<name>", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      {
        area: "ambience",
        event: {
          movie: { at: 1_000_000, movieId: 14 },
          previous: undefined,
          type: "movie",
        },
      },
      testRuleInput(),
    );
    expect(row).toMatchObject({ domain: "ambience", event: "ambience/movie" });
  });
});

describe("ambience/attach", () => {
  function attached(cinematic: AreaState<"ambience">["cinematic"]) {
    const game = createMockGame();
    const state: AreaState<"ambience"> = {
      ...game.ambience.state(),
      cinematic,
    };
    const withState = Object.assign(game, {
      ambience: { ...game.ambience, state: () => state },
    });
    return attachDrafts(areaRuleSet(), withState, testRuleInput());
  }

  test("a cinematic completed during login before attach logs one row at attach", () => {
    expect<unknown[]>(
      attached({ at: 1_000_000, completed: true, sequenceId: 84 }),
    ).toEqual([
      {
        class: "passive",
        data: { sequenceId: 84 },
        domain: "ambience",
        event: "ambience/cinematic",
        text: "The intro cinematic started; Peon skipped it.",
      },
    ]);
  });

  test("attach writes nothing without a completed cinematic", () => {
    expect(attached(undefined)).toEqual([]);
    expect(
      attached({ at: 1_000_000, completed: false, sequenceId: 84 }),
    ).toEqual([]);
  });
});
