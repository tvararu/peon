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

  test("a trigger message keeps its fallback shape", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      event("trigger_message", { text: "hello" }),
      testRuleInput(),
    );
    expect(drafts.map((draft) => draft.event)).toEqual([
      "objects/trigger_message",
    ]);
  });
});
