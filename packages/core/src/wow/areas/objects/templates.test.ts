import { describe, expect, test } from "bun:test";
import {
  GameObjectKind,
  gameObjectTemplate,
  lockId,
  pageId,
  questId,
  questItems,
} from "#wow/areas/objects/templates";

function words(...head: number[]): number[] {
  return [...head, ...Array.from({ length: 24 - head.length }, () => 0)];
}

const FACTORY_DOOR = { type: 0, data: words(0, 85) };
const MILLYS_HARVEST = { type: 3, data: words(43, 10_119, 0, 1) };
const SERPENTBLOOM = {
  type: 3,
  data: words(259, 2772, 0, 1, 0, 0, 0, 19_535, 962),
};
const SHRINE = { type: 10, data: words(0, 0, 0, 0, 0, 0, 0, 2936, 0, 5) };
const CANNON = { type: 10, data: words(0, 667, 0, 3000, 1) };
const ELIZAS_TOMBSTONE = { type: 9, data: words(731, 7, 2) };
const TASTYFISH = { type: 25, data: words(3, 17_280, 3, 5, 1628) };

describe("game object templates", () => {
  test("lockId reads the lock word of each type (GameObjectData.h:428-457)", () => {
    expect(lockId(FACTORY_DOOR)).toBe(85);
    expect(lockId(MILLYS_HARVEST)).toBe(43);
    expect(lockId(SERPENTBLOOM)).toBe(259);
    expect(lockId(TASTYFISH)).toBe(1628);
    expect(lockId(ELIZAS_TOMBSTONE)).toBe(0);
  });

  test("pageId reads text data0 and goober data7 (GameObjectData.h:154, :169)", () => {
    expect(pageId(ELIZAS_TOMBSTONE)).toBe(731);
    expect(pageId(SHRINE)).toBe(2936);
    expect(pageId(CANNON)).toBeUndefined();
    expect(pageId(MILLYS_HARVEST)).toBeUndefined();
  });

  test("questId reads chest data8 and goober data1 (GameObjectData.h:92, :163)", () => {
    expect(questId(SERPENTBLOOM)).toBe(962);
    expect(questId(CANNON)).toBe(667);
    expect(questId(MILLYS_HARVEST)).toBeUndefined();
    expect(questId(FACTORY_DOOR)).toBeUndefined();
  });

  test("questId keeps the signed -1 of goober and generic objects (GameObject.cpp:1346, :1358)", () => {
    expect(questId({ type: 10, data: words(0, 0xff_ff_ff_ff) })).toBe(-1);
    expect(
      questId({ type: 5, data: words(0, 0, 0, 0, 0, 0xff_ff_ff_ff) }),
    ).toBe(-1);
  });

  test("questItems keeps the item ids that are set", () => {
    expect(questItems({ questItems: [11_119, 0, 0, 0, 0, 0] })).toEqual([
      11_119,
    ]);
  });

  test("gameObjectTemplate keeps the reply and derives lock, page, quest and quest items", () => {
    const template = gameObjectTemplate({
      castBarCaption: "",
      data: MILLYS_HARVEST.data,
      displayId: 3012,
      entry: 161_557,
      gameObjectType: 3,
      iconName: "",
      name: "Milly's Harvest",
      questItems: [11_119, 0, 0, 0, 0, 0],
      size: 1,
      unk1: "",
    });
    expect(template).toEqual({
      castBarCaption: "",
      data: MILLYS_HARVEST.data,
      displayId: 3012,
      entry: 161_557,
      iconName: "",
      lockId: 43,
      name: "Milly's Harvest",
      pageId: undefined,
      questId: undefined,
      questItems: [11_119],
      size: 1,
      type: GameObjectKind.CHEST,
    });
  });
});
