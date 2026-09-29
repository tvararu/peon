import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type LfgEvent = AreaEventOf<"lfg">;

function rows(event: LfgEvent) {
  return areaDrafts(areaRuleSet(), { area: "lfg", event }, testRuleInput());
}

describe("lfg harness rules", () => {
  test.each([0, 1, 2])(
    "a proposal update in state %i writes one lfg/proposal row",
    (state) => {
      const [row, ...rest] = rows({
        dungeon: 0x06_00_00_02,
        id: 5,
        state,
        type: "proposal",
      });
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        class: "log",
        data: { dungeon: 0x06_00_00_02, id: 5, state },
        event: "lfg/proposal",
      });
    },
  );

  test("proposal rows differ between an open, failed and successful proposal", () => {
    const texts = [0, 1, 2].map(
      (state) =>
        rows({ dungeon: 1, id: 5, state, type: "proposal" })[0]?.text ?? "",
    );
    expect(new Set(texts).size).toBe(3);
  });

  test("a boot update writes an lfg/boot row with the vote counts and the victim as text", () => {
    const [row] = rows({
      agrees: 1,
      inProgress: true,
      needed: 3,
      type: "boot",
      victim: 0xabn,
      votes: 2,
    });
    expect(row).toMatchObject({
      class: "log",
      data: { agrees: 1, inProgress: true, needed: 3, victim: "171", votes: 2 },
      event: "lfg/boot",
    });
  });

  test("an ended boot vote reads differently from an open one", () => {
    const base = {
      agrees: 3,
      needed: 3,
      type: "boot",
      victim: 1n,
      votes: 3,
    } as const;
    expect(rows({ ...base, inProgress: true })[0]?.text).not.toBe(
      rows({ ...base, inProgress: false })[0]?.text,
    );
  });

  test("a teleport denial names its reason and code", () => {
    const [row] = rows({
      code: 6,
      reason: "invalid_location",
      type: "teleport_denied",
    });
    expect(row).toMatchObject({
      data: { code: 6, reason: "invalid_location" },
      event: "lfg/teleport_denied",
    });
    expect(row?.text).toContain("invalid_location");
  });

  test("offer continue writes one row with the dungeon entry", () => {
    expect(
      rows({ entry: 0x01_00_00_10, type: "offer_continue" }),
    ).toMatchObject([
      { data: { entry: 0x01_00_00_10 }, event: "lfg/offer_continue" },
    ]);
  });

  test("a reward writes money, xp and the item count", () => {
    expect(
      rows({
        dungeon: 2,
        itemCount: 2,
        money: 4321,
        randomDungeon: 1,
        type: "reward",
        xp: 900,
      }),
    ).toMatchObject([
      {
        data: {
          dungeon: 2,
          itemCount: 2,
          money: 4321,
          randomDungeon: 1,
          xp: 900,
        },
        event: "lfg/reward",
      },
    ]);
  });
});
