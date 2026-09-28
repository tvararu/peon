import { describe, expect, test } from "bun:test";
import {
  BREAD_ENTRY,
  BUYBACK_BREAD,
  buybackClear,
  buybackScene,
  buybackSell,
  buybackSellBread,
} from "#test-support/areas/buyback";
import type { BuybackEvent } from "#wow/areas/buyback/store";

describe("buyback list", () => {
  test("lists a sold item with the entry and count it had in the bag, its price and sale time", () => {
    const scene = buybackScene();
    const events: BuybackEvent[] = [];
    scene.rig.handle.onEvent((event) => events.push(event));
    try {
      expect(scene.rig.handle.state().list).toEqual([]);
      buybackSellBread(scene, 8);
      const list = [
        {
          count: 2,
          entry: BREAD_ENTRY,
          guid: BUYBACK_BREAD,
          price: 8,
          slot: 74,
          soldAt: 108_000,
        },
      ];
      expect(scene.rig.handle.state().list).toEqual(list);
      expect(events).toEqual([{ list, type: "listed" }]);
      scene.rig.touch();
      expect(events).toHaveLength(1);
    } finally {
      scene.rig.dispose();
    }
  });

  test("keeps the entry and count unknown for an item never seen in the bags", () => {
    const { rig, world } = buybackScene();
    try {
      buybackSell(world, { guid: 0x55n, price: 3, slot: 80 });
      rig.touch();
      expect(rig.handle.state().list).toEqual([
        {
          count: undefined,
          entry: undefined,
          guid: 0x55n,
          price: 3,
          slot: 80,
          soldAt: 108_000,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("drops a slot the server empties and emits a new list", () => {
    const scene = buybackScene();
    const events: BuybackEvent[] = [];
    try {
      buybackSellBread(scene);
      scene.rig.handle.onEvent((event) => events.push(event));
      buybackClear(scene.world, 74);
      scene.rig.touch();
      expect(scene.rig.handle.state().list).toEqual([]);
      expect(events).toEqual([{ list: [], type: "listed" }]);
    } finally {
      scene.rig.dispose();
    }
  });
});
