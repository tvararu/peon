import { describe, expect, test } from "bun:test";
import { UNIT_FIELDS } from "@peon/core";
import { grayLevel } from "#harness/loops/combat-actions-credit";
import { context, setup } from "#test-support/combat-actions-fixtures";

const TAPPED = 0x4;
const TAPPED_BY_PLAYER = 0x8;
const LOOTABLE = 0x1;

function fight(init: {
  own: number;
  level: number;
  flags?: number;
  engaged?: boolean;
}) {
  let time = 1000;
  const f = setup(() => time);
  f.store.update(1n, {}, new Map([[UNIT_FIELDS.LEVEL.offset, init.own]]));
  f.store.update(2n, {}, new Map([[UNIT_FIELDS.LEVEL.offset, init.level]]));
  if (init.engaged === false) f.store.update(2n, { target: 0n, unitFlags: 0 });
  f.actions.observe(context);
  f.store.update(
    2n,
    {},
    new Map([
      [UNIT_FIELDS.HEALTH.offset, 0],
      [UNIT_FIELDS.DYNAMIC_FLAGS.offset, init.flags ?? 0],
    ]),
  );
  return {
    at(ms: number) {
      time = 1000 + ms;
      return f.actions.observe(context).outcome;
    },
  };
}

describe("kill credit without XP", () => {
  test("uses the 3.3.5a gray level bands", () => {
    expect([1, 5, 6, 10, 20, 39, 40, 59, 60, 80].map(grayLevel)).toEqual([
      0, 0, 1, 4, 13, 31, 31, 47, 51, 71,
    ]);
  });

  test("credits a gray kill at once with no XP", () => {
    const f = fight({ level: 13, own: 20 });
    expect(f.at(0)).toEqual({ reason: "gray", status: "completed" });
  });

  test("credits a kill tapped by the character after the XP wait", () => {
    const f = fight({ flags: TAPPED | TAPPED_BY_PLAYER, level: 19, own: 20 });
    expect(f.at(0)).toBeUndefined();
    expect(f.at(5001)).toEqual({ reason: "no_xp_kill", status: "completed" });
  });

  test("credits a lootable corpse as the character's kill", () => {
    const f = fight({ flags: LOOTABLE, level: 19, own: 20 });
    expect(f.at(0)).toBeUndefined();
    expect(f.at(5001)).toEqual({ reason: "no_xp_kill", status: "completed" });
  });

  test("names another player only when the tap is not the character's", () => {
    const f = fight({ flags: TAPPED, level: 13, own: 20 });
    expect(f.at(0)).toBeUndefined();
    expect(f.at(5001)).toEqual({
      reason: "target_dead_tapped_by_other",
      status: "blocked",
    });
  });

  test("keeps an unexplained death without credit", () => {
    const f = fight({ level: 19, own: 20 });
    expect(f.at(0)).toBeUndefined();
    expect(f.at(5001)).toEqual({
      reason: "target_dead_without_server_credit",
      status: "blocked",
    });
  });

  test("does not credit a gray creature the character never fought", () => {
    const f = fight({ engaged: false, level: 13, own: 20 });
    expect(f.at(0)).toBeUndefined();
    expect(f.at(5001)).toEqual({
      reason: "target_dead_without_server_credit",
      status: "blocked",
    });
  });
});
