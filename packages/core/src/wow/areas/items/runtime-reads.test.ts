import { describe, expect, jest, test } from "bun:test";
import {
  itemsInventoryChangeFailureBody,
  itemsItemTextQueryResponseBody,
  itemsLootResponseBody,
  itemsReadItemResultBody,
} from "#test-support/areas/items";
import {
  type ItemsWorld,
  itemsRig,
  itemsWorld,
} from "#test-support/areas/items-world";
import type { ItemsEvent } from "#wow/areas/items/events";
import {
  buildItemTextQuery,
  buildOpenItem,
  buildReadItem,
} from "#wow/areas/items/protocol-read";
import type { SentPacket } from "#wow/areas/port";
import { registerLootHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { WorldConn } from "#wow/world-conn";

const ME = 0x0a_00n;
const LETTER = 0x40_00_00_00_00_00_00_01n;
const SACK = 0x40_00_00_00_00_00_00_02n;
const SWORD = 0x40_00_00_00_00_00_00_03n;
const OTHER = 0x40_00_00_00_00_00_00_09n;
const FAIL = GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE;
const ITEM_NOT_FOUND = 23;
const CANT_EQUIP_LEVEL = 1;
const CANT_DO_RIGHT_NOW = 39;

function setup(seed: (world: ItemsWorld) => void = () => undefined) {
  const world = itemsWorld(ME);
  world.put(255, 23, { entry: 889, guid: LETTER });
  world.put(255, 24, { entry: 5335, guid: SACK });
  world.put(255, 25, { entry: 25, guid: SWORD });
  seed(world);
  const rig = itemsRig(world, (dispatch, stores) =>
    registerLootHandlers({ dispatch } as unknown as WorldConn, stores),
  );
  const events: ItemsEvent[] = [];
  rig.stores.areas.items.onEvent((event) => events.push(event));
  return { events, rig, world };
}

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const types = (events: readonly ItemsEvent[]) => events.map((e) => e.type);

describe("items runtime: read", () => {
  test("read sends CMSG_READ_ITEM and settles ok on SMSG_READ_ITEM_OK for that guid", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.read({ bag: 255, slot: 23 });
      expect(sends(rig.sent, GameOpcode.CMSG_READ_ITEM)).toEqual([
        {
          body: buildReadItem({ bag: 255, slot: 23 }),
          opcode: GameOpcode.CMSG_READ_ITEM,
        },
      ]);
      rig.inject(GameOpcode.SMSG_READ_ITEM_OK, itemsReadItemResultBody(OTHER));
      expect(rig.handle.state().read.pending).toBeDefined();
      rig.inject(GameOpcode.SMSG_READ_ITEM_OK, itemsReadItemResultBody(LETTER));
      expect(await pending).toMatchObject({
        request: { entry: 889, itemGuid: LETTER, kind: "read" },
        status: "ok",
      });
      expect(types(events)).toEqual(["read_requested", "read_ok"]);
    } finally {
      rig.dispose();
    }
  });

  test("the failure packet before SMSG_READ_ITEM_FAILED settles failed with its reason", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.read({ bag: 255, slot: 23 });
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({
          item1: LETTER,
          requiredLevel: 20,
          result: CANT_EQUIP_LEVEL,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_READ_ITEM_FAILED,
        itemsReadItemResultBody(LETTER),
      );
      expect(await pending).toMatchObject({
        reason: "cant_equip_level_i",
        status: "failed",
      });
      expect(events.at(-1)).toEqual({
        entry: 889,
        itemGuid: LETTER,
        reason: "cant_equip_level_i",
        result: CANT_EQUIP_LEVEL,
        type: "read_failed",
      });
      expect(types(events)).toEqual(["read_requested", "read_failed"]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_READ_ITEM_FAILED alone settles failed", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.read({ bag: 255, slot: 23 });
      rig.inject(
        GameOpcode.SMSG_READ_ITEM_FAILED,
        itemsReadItemResultBody(LETTER),
      );
      expect(await pending).toMatchObject({
        reason: "read_item_failed",
        status: "failed",
      });
    } finally {
      rig.dispose();
    }
  });

  test("an item with no page text draws ITEM_NOT_FOUND with no item and settles failed", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.read({ bag: 255, slot: 25 });
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ result: ITEM_NOT_FOUND }),
      );
      expect(await pending).toMatchObject({
        reason: "item_not_found",
        request: { itemGuid: SWORD },
        status: "failed",
      });
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.read({ bag: 255, slot: 23 });
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().read.pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toMatchObject({ status: "unanswered" });
      expect(types(events)).toEqual(["read_requested", "read_unanswered"]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a read needs an item at the position and no other read", async () => {
    const { rig } = setup();
    try {
      await expect(rig.handle.act.read({ bag: 255, slot: 30 })).rejects.toThrow(
        "empty",
      );
      const pending = rig.handle.act.read({ bag: 255, slot: 23 });
      await expect(rig.handle.act.read({ bag: 255, slot: 23 })).rejects.toThrow(
        "pending",
      );
      expect(sends(rig.sent, GameOpcode.CMSG_READ_ITEM)).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_READ_ITEM_OK, itemsReadItemResultBody(LETTER));
      await pending;
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime: item text", () => {
  test("queryText sends one query per guid and caches the text", async () => {
    const { events, rig } = setup();
    try {
      const first = rig.handle.act.queryText(LETTER);
      const again = rig.handle.act.queryText(LETTER);
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_TEXT_QUERY)).toEqual([
        {
          body: buildItemTextQuery(LETTER),
          opcode: GameOpcode.CMSG_ITEM_TEXT_QUERY,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_ITEM_TEXT_QUERY_RESPONSE,
        itemsItemTextQueryResponseBody({ guid: LETTER, text: "Dear Mother" }),
      );
      expect(await first).toBe("Dear Mother");
      expect(await again).toBe("Dear Mother");
      expect(await rig.handle.act.queryText(LETTER)).toBe("Dear Mother");
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_TEXT_QUERY)).toHaveLength(1);
      expect(events).toEqual([
        { guid: LETTER, text: "Dear Mother", type: "item_text" },
      ]);
      expect(rig.handle.state().read.texts).toEqual([
        { guid: LETTER, text: "Dear Mother" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an item the server does not find resolves undefined", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.queryText(OTHER);
      rig.inject(
        GameOpcode.SMSG_ITEM_TEXT_QUERY_RESPONSE,
        itemsItemTextQueryResponseBody(undefined),
      );
      expect(await pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime: open", () => {
  test("open asks the rewards store, sends CMSG_OPEN_ITEM and resolves on the item's loot window", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.open({ bag: 255, slot: 24 });
      expect(sends(rig.sent, GameOpcode.CMSG_OPEN_ITEM)).toEqual([
        {
          body: buildOpenItem({ bag: 255, slot: 24 }),
          opcode: GameOpcode.CMSG_OPEN_ITEM,
        },
      ]);
      expect(rig.stores.rewards.loot).toMatchObject({
        guid: SACK,
        phase: "opening",
      });
      rig.inject(
        GameOpcode.SMSG_LOOT_RESPONSE,
        itemsLootResponseBody(SACK, 57),
      );
      expect(await pending).toMatchObject({
        guid: SACK,
        money: 57,
        phase: "open",
      });
      expect(rig.handle.state().read.last).toMatchObject({
        request: { itemGuid: SACK, kind: "open" },
        status: "ok",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a failure naming the item rejects and closes the opening window", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.open({ bag: 255, slot: 23 });
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({
          item1: LETTER,
          result: CANT_DO_RIGHT_NOW,
        }),
      );
      await expect(pending).rejects.toThrow("cant_do_right_now");
      expect(rig.stores.rewards.loot).toEqual({ phase: "closed" });
      expect(rig.handle.state().read.last).toMatchObject({
        reason: "cant_do_right_now",
        status: "failed",
      });
    } finally {
      rig.dispose();
    }
  });

  test("no loot window in 5 s rejects and closes the opening window", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const pending = rig.handle.act.open({ bag: 255, slot: 24 });
      const caught = pending.catch((error: Error) => error.message);
      jest.advanceTimersByTime(5000);
      expect(await caught).toBe("the open went unanswered");
      expect(rig.stores.rewards.loot).toEqual({ phase: "closed" });
      expect(rig.handle.state().read.last).toMatchObject({
        status: "unanswered",
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("open refuses while a loot window is open or the character is dead", async () => {
    const { rig, world } = setup();
    try {
      rig.stores.rewards.requestOpen(OTHER);
      await expect(rig.handle.act.open({ bag: 255, slot: 24 })).rejects.toThrow(
        "loot window",
      );
      rig.stores.rewards.failOpen("test");
      world.setHealth(0);
      await expect(rig.handle.act.open({ bag: 255, slot: 24 })).rejects.toThrow(
        "dead",
      );
      expect(sends(rig.sent, GameOpcode.CMSG_OPEN_ITEM)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime: reads beside moves", () => {
  test("a failure with no item while a move and a read wait settles neither", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const move = rig.handle.act.move(
        { bag: 255, slot: 25 },
        { bag: 255, slot: 30 },
      );
      const read = rig.handle.act.read({ bag: 255, slot: 23 });
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ result: ITEM_NOT_FOUND }),
      );
      expect(rig.handle.state().read.pending).toBeDefined();
      expect(rig.handle.state().move.pending).toBeDefined();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({
          item1: LETTER,
          result: CANT_EQUIP_LEVEL,
          requiredLevel: 20,
        }),
      );
      expect(await read).toMatchObject({ status: "failed" });
      expect(rig.handle.state().move.pending).toBeDefined();
      jest.advanceTimersByTime(5000);
      expect(await move).toMatchObject({ last: { status: "unanswered" } });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
