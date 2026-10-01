import { describe, expect, jest, test } from "bun:test";
import {
  itemsRefundInfoResponseBody,
  itemsRefundResultBody,
} from "#test-support/areas/items";
import { itemsRig, itemsWorld } from "#test-support/areas/items-world";
import type { ItemsEvent } from "#wow/areas/items/events";
import {
  buildItemRefund,
  buildItemRefundInfo,
} from "#wow/areas/items/protocol-refund";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x0a_00n;
const ITEM = 0x40_00_00_00_00_00_12_34n;
const STRANGER = 0x40_00_00_00_00_00_00_09n;

const COSTS = [
  { count: 5, entry: 29_434 },
  { count: 0, entry: 0 },
  { count: 0, entry: 0 },
  { count: 0, entry: 0 },
  { count: 0, entry: 0 },
] as const;

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 23, { entry: 29_266, guid: ITEM });
  const rig = itemsRig(world);
  const events: ItemsEvent[] = [];
  rig.stores.areas.items.onEvent((event) => events.push(event));
  return { events, rig };
}

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const types = (events: readonly ItemsEvent[]) => events.map((e) => e.type);

const infoBody = (guid: bigint) =>
  itemsRefundInfoResponseBody({
    arena: 0,
    costs: [...COSTS],
    delta: 3600,
    honor: 0,
    itemGuid: guid,
    money: 12_345,
  });

describe("items runtime: refundInfo", () => {
  test("info sends the guid and caches the offer by item", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.refundInfo(ITEM);
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_REFUND_INFO)).toEqual([
        {
          body: buildItemRefundInfo(ITEM),
          opcode: GameOpcode.CMSG_ITEM_REFUND_INFO,
        },
      ]);
      rig.inject(GameOpcode.SMSG_ITEM_REFUND_INFO_RESPONSE, infoBody(STRANGER));
      expect(rig.handle.state().refund.infoPending).toBeDefined();
      rig.inject(GameOpcode.SMSG_ITEM_REFUND_INFO_RESPONSE, infoBody(ITEM));
      expect(await pending).toMatchObject({ itemGuid: ITEM, money: 12_345 });
      expect(rig.handle.state().refund.offers).toHaveLength(2);
      expect(types(events)).toEqual(["refund_info"]);
      expect(await rig.handle.act.refundInfo(ITEM)).toMatchObject({
        itemGuid: ITEM,
      });
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_REFUND_INFO)).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles none", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.refundInfo(ITEM);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().refund.infoPending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toBeUndefined();
      expect(rig.handle.state().refund.infoPending).toBeUndefined();
      expect(types(events)).toEqual(["refund_info_none"]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("an info query for a missing item is refused before sending", async () => {
    const { rig } = setup();
    try {
      await expect(rig.handle.act.refundInfo(STRANGER)).rejects.toThrow(
        "not in the inventory",
      );
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_REFUND_INFO)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a second info query while one is pending is refused", async () => {
    const { rig } = setup();
    try {
      const first = rig.handle.act.refundInfo(ITEM);
      await expect(rig.handle.act.refundInfo(ITEM)).rejects.toThrow(
        "already pending",
      );
      rig.inject(GameOpcode.SMSG_ITEM_REFUND_INFO_RESPONSE, infoBody(ITEM));
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("disposing the area rejects the pending info query and clears it", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.refundInfo(ITEM);
    const caught = pending.catch((error: unknown) => error);
    rig.dispose();
    expect(await caught).toBeInstanceOf(Error);
    expect(rig.handle.state().refund.infoPending).toBeUndefined();
  });
});

describe("items runtime: refund", () => {
  test("refund sends the guid and settles confirmed on a success result", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.refund(ITEM);
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_REFUND)).toEqual([
        { body: buildItemRefund(ITEM), opcode: GameOpcode.CMSG_ITEM_REFUND },
      ]);
      rig.inject(
        GameOpcode.SMSG_ITEM_REFUND_RESULT,
        itemsRefundResultBody({ itemGuid: STRANGER, result: 10 }),
      );
      expect(rig.handle.state().refund.refundPending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_ITEM_REFUND_RESULT,
        itemsRefundResultBody({
          arena: 0,
          costs: [...COSTS],
          honor: 0,
          itemGuid: ITEM,
          money: 12_345,
          result: 0,
        }),
      );
      expect(await pending).toMatchObject({
        result: { money: 12_345, result: 0 },
        status: "confirmed",
      });
      expect(types(events)).toEqual(["refund_result"]);
    } finally {
      rig.dispose();
    }
  });

  test("an error result settles refused", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.refund(ITEM);
      rig.inject(
        GameOpcode.SMSG_ITEM_REFUND_RESULT,
        itemsRefundResultBody({ itemGuid: ITEM, result: 10 }),
      );
      expect(await pending).toMatchObject({
        reason: "refund_failed",
        status: "refused",
      });
      expect(types(events)).toEqual(["refund_result"]);
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.refund(ITEM);
      jest.advanceTimersByTime(5000);
      expect(await pending).toMatchObject({ status: "unanswered" });
      expect(rig.handle.state().refund.refundPending).toBeUndefined();
      expect(types(events)).toEqual(["refund_unanswered"]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a refund for a missing item is refused before sending", async () => {
    const { rig } = setup();
    try {
      await expect(rig.handle.act.refund(STRANGER)).rejects.toThrow(
        "not in the inventory",
      );
      expect(sends(rig.sent, GameOpcode.CMSG_ITEM_REFUND)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("disposing the area rejects the pending refund and clears it", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.refund(ITEM);
    const caught = pending.catch((error: unknown) => error);
    rig.dispose();
    expect(await caught).toBeInstanceOf(Error);
    expect(rig.handle.state().refund.refundPending).toBeUndefined();
  });
});
