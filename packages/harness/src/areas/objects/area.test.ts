import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { objectsHarness } from "#harness/areas/objects/area";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const GUID = 0xf110_0000_0000_0070n;

function event(type: string, inner: object): AreaEvent {
  return { area: "objects", event: { type, ...inner } } as unknown as AreaEvent;
}

describe("objects harness area", () => {
  test("the area claims the use, open and readPage acts", () => {
    expect(objectsHarness.worldActs).toEqual(["use", "open", "readPage"]);
  });

  test("a use writes one objects/used log row", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      event("used", { entry: 161_557, guid: GUID, how: "use" }),
      testRuleInput(),
    );
    expect(drafts.map((draft) => draft.event)).toEqual(["objects/used"]);
    expect(drafts[0]?.class).toBe("log");
  });

  test("a read chain writes one objects/page log row", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      event("page_read", {
        firstPageId: 2936,
        pages: [{ pageId: 2936, text: "You have discovered" }],
      }),
      testRuleInput(),
    );
    expect(drafts.map((draft) => draft.event)).toEqual(["objects/page"]);
  });

  test("a trigger send writes one objects/trigger log row", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      event("trigger_sent", { map: 0, triggerId: 88 }),
      testRuleInput(),
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        class: "log",
        data: { map: 0, triggerId: 88 },
        event: "objects/trigger",
        text: "Entered area trigger 88.",
      }),
    ]);
    expect(drafts[0]?.progress).toBeUndefined();
  });

  test("a trigger message wakes an idle agent and is passive in a run", () => {
    const text = "You must be at least level 10 to enter.";
    for (const [runActive, cls] of [
      [false, "wake"],
      [true, "passive"],
    ] as const) {
      const drafts = areaDrafts(
        areaRuleSet(),
        event("trigger_message", { text }),
        testRuleInput({ runActive }),
      );
      expect(drafts).toEqual([
        expect.objectContaining({
          class: cls,
          data: { text },
          event: "objects/message",
          text,
        }),
      ]);
      expect(drafts[0]?.progress).toBeUndefined();
    }
  });
});
