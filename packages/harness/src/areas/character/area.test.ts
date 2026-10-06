import { describe, expect, test } from "bun:test";
import { characterHarness } from "#harness/areas/character/area";

describe("character harness area", () => {
  test("played time drafts a readable log row", () => {
    const rules = characterHarness.rules?.();
    expect(rules).toBeDefined();
    const rows = rules?.event?.(
      {
        state: {
          barberOpen: false,
          barberResult: undefined,
          cloakShown: undefined,
          declined: undefined,
          helmShown: undefined,
          operation: undefined,
          played: { levelSeconds: 20, totalSeconds: 7260, trigger: false },
          sheath: undefined,
          warning: undefined,
          whois: undefined,
        },
        type: "played_time",
      } as never,
      {} as never,
    );
    expect(rows).toEqual([
      {
        class: "log",
        data: { totalSeconds: 7260 },
        name: "played_time",
        text: "Played 2h 1m in total.",
      },
    ]);
  });

  test("other events fall back to the default draft", () => {
    const rules = characterHarness.rules?.();
    const rows = rules?.event?.(
      { state: {}, type: "barber_open" } as never,
      {} as never,
    );
    expect(rows).toEqual([]);
  });
});
