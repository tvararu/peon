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
    const seen = rules()({
      guid: 0x1f_c0_00_00_00_00_00_14n,
      type: "transport_seen",
    });
    expect(seen).toMatchObject([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "transport_seen",
      },
    ]);
    expect(seen[0]?.text).toContain("came into view");
    const gone = rules()({
      guid: 0x1f_c0_00_00_00_00_00_14n,
      type: "transport_gone",
    });
    expect(gone).toMatchObject([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "transport_gone",
      },
    ]);
    expect(gone[0]?.text).toContain("left view");
  });

  test("boarded, left and map_change each write one log row", () => {
    const boarded = rules()({
      entry: 190_549,
      transport: 0x1f_c0_00_00_00_00_00_14n,
      type: "boarded",
    });
    expect(boarded).toMatchObject([
      {
        class: "log",
        data: { entry: 190_549, guid: "0x1fc0000000000014" },
        name: "boarded",
      },
    ]);
    expect(boarded[0]?.text).toContain("Boarded");
    const left = rules()({
      transport: 0x1f_c0_00_00_00_00_00_14n,
      type: "left",
    });
    expect(left).toMatchObject([
      {
        class: "log",
        data: { guid: "0x1fc0000000000014" },
        name: "left",
      },
    ]);
    expect(left[0]?.text).toContain("Left a transport");
    const change = rules()({
      entry: 20_808,
      fromMap: 1,
      toMap: 530,
      type: "map_change",
    });
    expect(change).toMatchObject([
      {
        class: "log",
        data: { entry: 20_808, fromMap: 1, toMap: 530 },
        name: "map_change",
      },
    ]);
    expect(change[0]?.text).toContain("Changed maps");
  });
});
