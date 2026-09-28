import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { ambienceHarness } from "#harness/areas/ambience/area";
import type { AreaDraft } from "#harness/areas/contract";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
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
