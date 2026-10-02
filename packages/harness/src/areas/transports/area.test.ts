import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { transportsHarness } from "#harness/areas/transports/area";
import { testRuleInput } from "#test-support/rule-fixtures";

type TransportsEvent = AreaEventOf<"transports">;

function rules() {
  const event = transportsHarness.rules?.().event;
  if (!event) throw new Error("transports has no event rule");
  return (e: TransportsEvent): readonly AreaDraft[] =>
    event(e, testRuleInput());
}

describe("transports rows", () => {
  test("seen and gone each write one log row", () => {
    expect(
      rules()({ guid: 0x1f_c0_00_00_00_00_00_14n, type: "transport_seen" }),
    ).toEqual([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "transport_seen",
        text: "A transport came into view.",
      },
    ]);
    expect(
      rules()({ guid: 0x1f_c0_00_00_00_00_00_14n, type: "transport_gone" }),
    ).toEqual([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "transport_gone",
        text: "A transport left view.",
      },
    ]);
  });

  test("boarded, left and map_change each write one log row", () => {
    expect(
      rules()({
        entry: 190_549,
        transport: 0x1f_c0_00_00_00_00_00_14n,
        type: "boarded",
      }),
    ).toEqual([
      {
        class: "log",
        data: { entry: 190_549, guid: "0x1fc0000000000014" },
        name: "boarded",
        text: "Boarded a transport.",
      },
    ]);
    expect(
      rules()({ transport: 0x1f_c0_00_00_00_00_00_14n, type: "left" }),
    ).toEqual([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "left",
        text: "Left a transport.",
      },
    ]);
    expect(
      rules()({ entry: 20_808, fromMap: 1, toMap: 530, type: "map_change" }),
    ).toEqual([
      {
        class: "log",
        data: { entry: 20_808, fromMap: 1, toMap: 530 },
        name: "map_change",
        text: "Changed maps on a transport.",
      },
    ]);
  });
});
