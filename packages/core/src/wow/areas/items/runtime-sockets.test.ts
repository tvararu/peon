import { describe, expect, jest, test } from "bun:test";
import {
  itemsEnchantmentLogBody,
  itemsInventoryChangeFailureBody,
  itemsSocketGemsResultBody,
} from "#test-support/areas/items";
import { itemsRig, itemsWorld } from "#test-support/areas/items-world";
import {
  buildCancelTempEnchantment,
  buildSocketGems,
} from "#wow/areas/items/protocol-sockets";
import type { ItemsEvent } from "#wow/areas/items/store";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x0a_00n;
const OTHER = 0x0b_00n;
const RING = 0x40_00_00_00_00_00_00_01n;
const GEM_A = 0x40_00_00_00_00_00_00_02n;
const GEM_B = 0x40_00_00_00_00_00_00_03n;
const STRANGER = 0x40_00_00_00_00_00_00_09n;
const CANT_DO_RIGHT_NOW = 39;

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 15, { entry: 40_000, guid: RING });
  world.put(255, 23, { entry: 32_000, guid: GEM_A });
  world.put(255, 24, { entry: 32_001, guid: GEM_B });
  const rig = itemsRig(world);
  const events: ItemsEvent[] = [];
  rig.stores.areas.items.onEvent((event) => events.push(event));
  return { events, rig };
}

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const types = (events: readonly ItemsEvent[]) => events.map((e) => e.type);

describe("items runtime: socket", () => {
  test("socket sends the item and gems, logs arrive, and the result settles confirmed", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.socket(RING, [GEM_A, GEM_B]);
      expect(sends(rig.sent, GameOpcode.CMSG_SOCKET_GEMS)).toEqual([
        {
          body: buildSocketGems(RING, [GEM_A, GEM_B]),
          opcode: GameOpcode.CMSG_SOCKET_GEMS,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_ENCHANTMENTLOG,
        itemsEnchantmentLogBody({
          caster: ME,
          enchantId: 3101,
          entry: 40_000,
          target: ME,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_SOCKET_GEMS_RESULT,
        itemsSocketGemsResultBody(STRANGER, [1, 0, 0, 0]),
      );
      expect(rig.handle.state().sockets.pending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_SOCKET_GEMS_RESULT,
        itemsSocketGemsResultBody(RING, [3101, 3102, 0, 3312]),
      );
      const outcome = await pending;
      expect(outcome).toMatchObject({
        bonus: 3312,
        request: { entry: 40_000, itemGuid: RING },
        sockets: [3101, 3102, 0],
        status: "confirmed",
      });
      expect(rig.handle.state().sockets).toMatchObject({
        last: { status: "confirmed" },
        pending: undefined,
      });
      expect(types(events)).toEqual([
        "enchantment_log",
        "sockets_updated",
        "sockets_updated",
      ]);
      expect(events[0]).toMatchObject({
        enchantId: 3101,
        entry: 40_000,
        own: true,
      });
    } finally {
      rig.dispose();
    }
  });

  test("an enchant log for another player's item is not own", () => {
    const { events, rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_ENCHANTMENTLOG,
        itemsEnchantmentLogBody({
          caster: OTHER,
          enchantId: 3101,
          entry: 40_000,
          target: OTHER,
        }),
      );
      expect(events).toEqual([
        {
          caster: OTHER,
          enchantId: 3101,
          entry: 40_000,
          own: false,
          target: OTHER,
          type: "enchantment_log",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });
  test("an enchant log with an empty caster still parses", () => {
    const { events, rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_ENCHANTMENTLOG,
        itemsEnchantmentLogBody({
          caster: 0n,
          enchantId: 0,
          entry: 40_000,
          target: ME,
        }),
      );
      expect(events).toEqual([
        {
          caster: 0n,
          enchantId: 0,
          entry: 40_000,
          own: true,
          target: ME,
          type: "enchantment_log",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an inventory failure for the item settles refused", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.socket(RING, [GEM_A]);
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: STRANGER,
          result: CANT_DO_RIGHT_NOW,
        }),
      );
      expect(rig.handle.state().sockets.pending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: RING,
          result: CANT_DO_RIGHT_NOW,
        }),
      );
      expect(await pending).toMatchObject({
        reason: "cant_do_right_now",
        status: "refused",
      });
      expect(types(events)).toEqual(["socket_refused"]);
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.socket(RING, [GEM_A]);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().sockets.pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toMatchObject({ status: "unanswered" });
      expect(rig.handle.state().sockets.pending).toBeUndefined();
      expect(types(events)).toEqual(["socket_unanswered"]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a request the server would drop silently is refused before sending", async () => {
    const { rig } = setup();
    try {
      const refusals = [
        rig.handle.act.socket(RING, [GEM_A, GEM_A]),
        rig.handle.act.socket(RING, []),
        rig.handle.act.socket(RING, [GEM_A, GEM_B, GEM_A, GEM_B]),
        rig.handle.act.socket(STRANGER, [GEM_A]),
        rig.handle.act.socket(RING, [STRANGER]),
        rig.handle.act.socket(RING, [RING]),
      ];
      const settled = await Promise.allSettled(refusals);
      expect(settled.map((s) => s.status)).toEqual(
        new Array(6).fill("rejected"),
      );
      expect(sends(rig.sent, GameOpcode.CMSG_SOCKET_GEMS)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a gem inside an equipped bag is sent, an equipped gem is refused", async () => {
    const BAG = 0x40_00_00_00_00_00_00_0an;
    const BAG_GEM = 0x40_00_00_00_00_00_00_0bn;
    const world = itemsWorld(ME);
    world.put(255, 15, { entry: 40_000, guid: RING });
    world.put(255, 19, { bagSlots: 6, entry: 4496, guid: BAG });
    world.put(19, 2, { entry: 32_000, guid: BAG_GEM });
    world.put(255, 3, { entry: 32_001, guid: GEM_B });
    const rig = itemsRig(world);
    try {
      await expect(rig.handle.act.socket(RING, [GEM_B])).rejects.toThrow(
        "not in the bags",
      );
      expect(sends(rig.sent, GameOpcode.CMSG_SOCKET_GEMS)).toEqual([]);
      const pending = rig.handle.act.socket(RING, [BAG_GEM]);
      expect(sends(rig.sent, GameOpcode.CMSG_SOCKET_GEMS)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_SOCKET_GEMS_RESULT,
        itemsSocketGemsResultBody(RING, [1, 0, 0, 0]),
      );
      await pending;
    } finally {
      rig.dispose();
    }
  });

  test("a second socket while one is pending is refused", async () => {
    const { rig } = setup();
    try {
      const first = rig.handle.act.socket(RING, [GEM_A]);
      await expect(rig.handle.act.socket(RING, [GEM_B])).rejects.toThrow(
        "already pending",
      );
      rig.inject(
        GameOpcode.SMSG_SOCKET_GEMS_RESULT,
        itemsSocketGemsResultBody(RING, [1, 0, 0, 0]),
      );
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("disposing the area rejects the pending socket and clears it", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.socket(RING, [GEM_A]);
    const caught = pending.catch((error: unknown) => error);
    rig.dispose();
    expect(await caught).toBeInstanceOf(Error);
    expect(rig.handle.state().sockets.pending).toBeUndefined();
  });
});

describe("items runtime: cancelTempEnchant", () => {
  test("cancelTempEnchant sends the slot and settles ok at once", async () => {
    const { rig } = setup();
    try {
      expect(await rig.handle.act.cancelTempEnchant(15)).toEqual({
        slot: 15,
        status: "ok",
      });
      expect(sends(rig.sent, GameOpcode.CMSG_CANCEL_TEMP_ENCHANTMENT)).toEqual([
        {
          body: buildCancelTempEnchantment(15),
          opcode: GameOpcode.CMSG_CANCEL_TEMP_ENCHANTMENT,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("slots outside the equipment range are refused locally", async () => {
    const { rig } = setup();
    try {
      for (const slot of [23, 255, -1, 1.5])
        expect(() => rig.handle.act.cancelTempEnchant(slot)).toThrow(
          "equipment slot",
        );
      expect(sends(rig.sent, GameOpcode.CMSG_CANCEL_TEMP_ENCHANTMENT)).toEqual(
        [],
      );
    } finally {
      rig.dispose();
    }
  });
});
