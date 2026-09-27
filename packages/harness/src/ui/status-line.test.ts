import { describe, expect, test } from "bun:test";
import { titleFor, workingMessage } from "#harness/ui/status-line";
import { nowFixture, selfFixture } from "#test-support/ui-fixture";

describe("titleFor", () => {
  test("puts danger in the tab title", () => {
    expect(titleFor(nowFixture())).toBe("Fgklibhlflc L10 81% ATTACKED");
  });

  test("a calm character shows health only", () => {
    expect(titleFor(nowFixture({ attackers: [] }))).toBe("Fgklibhlflc L10 81%");
  });

  test("death shows the life state", () => {
    expect(titleFor(nowFixture({ self: selfFixture({ life: "ghost" }) }))).toBe(
      "Fgklibhlflc L10 GHOST",
    );
  });

  test("no snapshot gives the program name", () => {
    expect(titleFor(undefined)).toBe("tuicraft");
  });
});

describe("workingMessage", () => {
  test("shows the run in game words", () => {
    const run = {
      elapsedMs: 9000,
      id: "r4",
      kind: "travel" as const,
      label: "travel corpse",
      progress: "23 yd → corpse",
    };
    expect(workingMessage(run)).toBe("walking 23 yd → corpse (r4, 9s)");
  });

  test("uses the label before the first progress text", () => {
    const run = {
      elapsedMs: 2000,
      id: "r5",
      kind: "engage" as const,
      label: "engage Springpaw Stalker u9",
      progress: undefined,
    };
    expect(workingMessage(run)).toBe("engage Springpaw Stalker u9 (r5, 2s)");
  });

  test("no run restores the default message", () => {
    expect(workingMessage(undefined)).toBeUndefined();
  });
});
