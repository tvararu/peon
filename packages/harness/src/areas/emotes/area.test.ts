import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function emotes(event: unknown): AreaEvent {
  return { area: "emotes", event } as unknown as AreaEvent;
}

const TEXT = {
  emoteNum: 0,
  guid: 0x11n,
  self: true,
  target: "Tessa",
  textEmote: 101,
  type: "text_emote",
};

describe("emotes harness rules", () => {
  test("a self text emote writes one sent log row with the emote and target", () => {
    const rows = areaDrafts(areaRuleSet(), emotes(TEXT), testRuleInput());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { target: "Tessa", textEmote: 101 },
      domain: "emotes",
      event: "emotes/sent",
    });
  });

  test("a self text emote without a target keeps the target empty", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      emotes({ ...TEXT, target: undefined, textEmote: 34 }),
      testRuleInput(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ textEmote: 34 });
    expect(rows[0]?.data["target"]).toBeUndefined();
  });

  test("another player's text emote and plain emotes write nothing", () => {
    const rc = testRuleInput();
    expect(
      areaDrafts(areaRuleSet(), emotes({ ...TEXT, self: false }), rc),
    ).toEqual([]);
    expect(
      areaDrafts(
        areaRuleSet(),
        emotes({ emote: 3, guid: 0x11n, type: "emote" }),
        rc,
      ),
    ).toEqual([]);
  });
});
