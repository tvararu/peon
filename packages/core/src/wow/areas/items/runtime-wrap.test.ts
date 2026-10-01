import { describe, expect, jest, test } from "bun:test";
import {
  itemsInventoryChangeFailureBody,
  itemsItemNameResponseBody,
  itemsSetFlags,
  itemsTemplate,
} from "#test-support/areas/items";
import {
  type ItemsRig,
  itemsRig,
  itemsWorld,
} from "#test-support/areas/items-world";
import type { ItemsEvent } from "#wow/areas/items/events";
import {
  buildItemNameQuery,
  buildWrapItem,
} from "#wow/areas/items/protocol-names";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x0a_00n;
const PAPER = 0x40_00_00_00_00_00_00_01n;
const SWORD = 0x40_00_00_00_00_00_00_02n;
const HELM = 0x40_00_00_00_00_00_00_03n;
const FAIL = GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE;
const WRAPPER = 0x2_00;
const PAPER_AT = { bag: 255, slot: 24 };
const SWORD_AT = { bag: 255, slot: 25 };

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 24, { count: 5, entry: 5042, guid: PAPER });
  world.put(255, 25, { entry: 25, guid: SWORD });
  world.put(255, 15, { entry: 1234, guid: HELM });
  const rig = itemsRig(world);
  rig.stores.items.receive({
    entry: 5042,
    template: itemsTemplate({ entry: 5042, flags: WRAPPER, stackSize: 10 }),
  });
  rig.stores.items.receive({ entry: 25, template: itemsTemplate({}) });
  rig.stores.items.receive({
    entry: 1234,
    template: itemsTemplate({ entry: 1234 }),
  });
  const events: ItemsEvent[] = [];
  rig.stores.areas.items.onEvent((event) => events.push(event));
  return { events, rig, world };
}

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const types = (events: readonly ItemsEvent[]) => events.map((e) => e.type);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function wrapped(world: ReturnType<typeof setup>["world"], rig: ItemsRig) {
  world.put(255, 25, { entry: 5043, guid: SWORD });
  itemsSetFlags(world.entities.get(SWORD), 0x8);
  world.setCount(PAPER, 4);
  rig.touch();
}

describe("items runtime: wrap", () => {
  test("wrap sends CMSG_WRAP_ITEM and settles confirmed once the item is flagged wrapped under its own guid (ItemHandler.cpp:1163-1190)", async () => {
    const { events, rig, world } = setup();
    try {
      const pending = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      await flush();
      expect(sends(rig.sent, GameOpcode.CMSG_WRAP_ITEM)).toEqual([
        {
          body: buildWrapItem(PAPER_AT, SWORD_AT),
          opcode: GameOpcode.CMSG_WRAP_ITEM,
        },
      ]);
      expect(rig.handle.state().move.pending).toMatchObject({
        itemGuid: SWORD,
        kind: "wrap",
        target: { guid: PAPER },
      });
      wrapped(world, rig);
      expect(await pending).toMatchObject({
        last: { status: "confirmed" },
        pending: undefined,
      });
      expect(types(events)).toEqual(["move_requested", "moved"]);
      expect(events[1]).toMatchObject({ itemGuid: SWORD, kind: "wrap" });
    } finally {
      rig.dispose();
    }
  });

  test("a refusal that names the item settles refused with the server's reason", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      await flush();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: SWORD, result: 43 }),
      );
      expect(await pending).toMatchObject({
        last: { reason: "stackable_cant_be_wrapped", status: "refused" },
      });
    } finally {
      rig.dispose();
    }
  });

  test("a refusal that names the gift paper is the wrap's own (ItemHandler.cpp:1097-1101)", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      await flush();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: PAPER, result: 49 }),
      );
      expect(await pending).toMatchObject({ last: { status: "refused" } });
    } finally {
      rig.dispose();
    }
  });

  test("a refusal naming a stranger is not the wrap's", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      await flush();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: 0x99n, result: 43 }),
      );
      expect(rig.handle.state().move.pending).toBeDefined();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: SWORD, result: 43 }),
      );
      await pending;
    } finally {
      rig.dispose();
    }
  });

  test("an unanswered wrap settles unanswered after 5 s", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const pending = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(rig.handle.state().move.pending).toBeDefined();
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().move.pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toMatchObject({
        last: { reason: "server_unanswered", status: "unanswered" },
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("local refusals send nothing", async () => {
    const { rig } = setup();
    try {
      await expect(rig.handle.act.wrap(SWORD_AT, PAPER_AT)).rejects.toThrow(
        "not a wrapper",
      );
      await expect(rig.handle.act.wrap(PAPER_AT, PAPER_AT)).rejects.toThrow(
        "itself",
      );
      await expect(
        rig.handle.act.wrap(PAPER_AT, { bag: 255, slot: 15 }),
      ).rejects.toThrow("worn");
      await expect(
        rig.handle.act.wrap(PAPER_AT, { bag: 255, slot: 30 }),
      ).rejects.toThrow("empty");
      await expect(
        rig.handle.act.wrap({ bag: 255, slot: 31 }, SWORD_AT),
      ).rejects.toThrow("empty");
      expect(sends(rig.sent, GameOpcode.CMSG_WRAP_ITEM)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a second wrap while one is pending is refused", async () => {
    const { rig, world } = setup();
    try {
      const first = rig.handle.act.wrap(PAPER_AT, SWORD_AT);
      await flush();
      await expect(rig.handle.act.wrap(PAPER_AT, SWORD_AT)).rejects.toThrow(
        "already pending",
      );
      wrapped(world, rig);
      await first;
    } finally {
      rig.dispose();
    }
  });
});

const FANG = { entry: 6473, inventoryType: 5, name: "Armor of the Fang" };
const fangBody = itemsItemNameResponseBody(FANG);

describe("items runtime: querySetItemName", () => {
  test("one send per entry; the reply fills the cache and emits set_item_name", async () => {
    const { events, rig } = setup();
    try {
      const first = rig.handle.act.querySetItemName(6473);
      const again = rig.handle.act.querySetItemName(6473);
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_NAME_QUERY)).toEqual([
        {
          body: buildItemNameQuery(6473),
          opcode: GameOpcode.CMSG_ITEM_NAME_QUERY,
        },
      ]);
      rig.inject(GameOpcode.SMSG_ITEM_NAME_QUERY_RESPONSE, fangBody);
      expect(await first).toEqual(FANG);
      expect(await again).toEqual(FANG);
      expect(await rig.handle.act.querySetItemName(6473)).toEqual(FANG);
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_NAME_QUERY)).toHaveLength(1);
      expect(events).toEqual([{ type: "set_item_name", ...FANG }]);
    } finally {
      rig.dispose();
    }
  });

  test("a reply for another entry does not answer this query", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.querySetItemName(25);
      rig.inject(GameOpcode.SMSG_ITEM_NAME_QUERY_RESPONSE, fangBody);
      jest.advanceTimersByTime(5000);
      expect(await pending).toBeUndefined();
      expect(types(events)).toEqual(["set_item_name", "set_item_name_none"]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("silence for 5 s settles none once, and the miss is remembered", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const first = rig.handle.act.querySetItemName(25);
      const second = rig.handle.act.querySetItemName(25);
      jest.advanceTimersByTime(4999);
      expect(events).toEqual([]);
      jest.advanceTimersByTime(1);
      expect(await first).toBeUndefined();
      expect(await second).toBeUndefined();
      expect(events).toEqual([{ entry: 25, type: "set_item_name_none" }]);
      expect(await rig.handle.act.querySetItemName(25)).toBeUndefined();
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_NAME_QUERY)).toHaveLength(1);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("dispose aborts a waiting query", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.querySetItemName(6473);
    const outcome = pending.then(
      (value) => ({ value }),
      (error: Error) => ({ error: error.name }),
    );
    rig.dispose();
    expect(await outcome).toEqual({ error: "AbortError" });
    expect(rig.stores.areas.items.awaitSetItemName(6473).first).toBe(true);
  });
});
