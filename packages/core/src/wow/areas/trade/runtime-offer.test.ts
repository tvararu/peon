import { describe, expect, test } from "bun:test";
import {
  TRADE_LINEN,
  TRADE_STATUS,
  TRADE_SWORD,
  tradeScene,
  tradeStatusBody,
  tradeStatusExtendedBody,
} from "#test-support/areas/trade";
import {
  buildAcceptTrade,
  buildClearTradeItem,
  buildSetTradeGold,
  buildSetTradeItem,
  buildUnacceptTrade,
} from "#wow/areas/trade/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("trade offers", () => {
  test("offerItem sends CMSG_SET_TRADE_ITEM and records the slot from the inventory (TradeHandler.cpp:905-911)", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const pending = rig.handle.act.offerItem(2, 255, 24);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildSetTradeItem(2, 255, 24),
          opcode: GameOpcode.CMSG_SET_TRADE_ITEM,
        },
      ]);
      expect(await pending).toEqual({ slot: 2 });
      expect(rig.handle.state().ownOffer.items).toEqual([
        { count: 3, entry: 2589, guid: TRADE_LINEN, slot: 2 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("offerItem throws for trade slot 6, an empty position and an equipped position (TradeHandler.cpp:905-911)", async () => {
    const scene = tradeScene((world) => {
      world.put(255, 0, { entry: 100, guid: TRADE_SWORD });
    });
    const { rig } = scene;
    const messages: string[] = [];
    try {
      scene.opened();
      for (const args of [
        [1, 255, 30],
        [1, 255, 0],
        [6, 255, 24],
      ] as Array<readonly [number, number, number]>) {
        try {
          await rig.handle.act.offerItem(...args);
          messages.push("resolved");
        } catch (error) {
          messages.push((error as Error).message);
        }
      }
      expect(messages[0]).toContain("empty");
      expect(messages[1]).toContain("equipped");
      expect(messages[2]).toContain("outside 0-5");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("offerItem throws for equipped bag positions 19-22 and sends nothing (Item.cpp:800, TradeHandler.cpp:887-891)", async () => {
    const scene = tradeScene((world) => {
      for (const slot of [19, 22])
        world.put(255, slot, { entry: 4496, guid: BigInt(0x50_00 + slot) });
    });
    const { rig } = scene;
    try {
      scene.opened();
      for (const slot of [19, 22]) {
        let message = "resolved";
        try {
          await rig.handle.act.offerItem(0, 255, slot);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toContain("equipped");
      }
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("offerItem throws for a duplicate item already in another trade slot (TradeHandler.cpp:905-911)", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      await rig.handle.act.offerItem(0, 255, 24);
      await rig.handle.act.offerItem(1, 255, 24);
      throw new Error("duplicate offer resolved");
    } catch (error) {
      expect((error as Error).message).toContain("already");
    } finally {
      scene.rig.dispose();
    }
  });

  test("withdrawItem sends CMSG_CLEAR_TRADE_ITEM and clears the own slot", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      await rig.handle.act.offerItem(2, 255, 24);
      const pending = rig.handle.act.withdrawItem(2);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildClearTradeItem(2),
        opcode: GameOpcode.CMSG_CLEAR_TRADE_ITEM,
      });
      expect(await pending).toEqual({ cleared: true });
      expect(rig.handle.state().ownOffer.items).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("offerGold sends CMSG_SET_TRADE_GOLD and throws above the coinage", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      try {
        await rig.handle.act.offerGold(5000);
        throw new Error("over-coinage offer resolved");
      } catch (error) {
        expect((error as Error).message).toContain("coinage");
      }
      const pending = rig.handle.act.offerGold(40);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildSetTradeGold(40),
          opcode: GameOpcode.CMSG_SET_TRADE_GOLD,
        },
      ]);
      expect(await pending).toEqual({ gold: 40 });
      expect(rig.handle.state().ownOffer.gold).toBe(40);
    } finally {
      rig.dispose();
    }
  });

  test("acceptTrade with a stale version throws offer_changed and sends nothing (N29)", () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const seen = rig.handle.state().theirOffer.version;
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS_EXTENDED,
        tradeStatusExtendedBody({ gold: 40, side: 1 }),
      );
      expect(() => rig.handle.act.acceptTrade(seen)).toThrow("offer_changed");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("acceptTrade sends CMSG_ACCEPT_TRADE and settles ok on completed", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const pending = rig.handle.act.acceptTrade();
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildAcceptTrade(),
          opcode: GameOpcode.CMSG_ACCEPT_TRADE,
        },
      ]);
      expect(rig.handle.state().selfAccepted).toBe(true);
      rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(8, {}));
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("acceptTrade settles refused on CLOSE_WINDOW after the send", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const pending = rig.handle.act.acceptTrade();
      await flush();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.CLOSE_WINDOW, { result: 50 }),
      );
      expect(await pending).toEqual({
        reason: "close_window",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("acceptTrade settles refused on TRADE_CANCELED instead of waiting for the timeout", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const pending = rig.handle.act.acceptTrade();
      await flush();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED, {}),
      );
      expect(await pending).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a new trade can be requested after a completed trade", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      const pending = rig.handle.act.acceptTrade();
      await flush();
      rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(8, {}));
      expect(await pending).toEqual({ status: "ok" });
      const next = rig.handle.act.requestTrade(0x99n);
      next.catch(() => undefined);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_INITIATE_TRADE);
    } finally {
      rig.dispose();
    }
  });

  test("acceptTrade throws when no trade is open", () => {
    const scene = tradeScene();
    try {
      expect(() => scene.rig.handle.act.acceptTrade()).toThrow("no trade");
    } finally {
      scene.rig.dispose();
    }
  });

  test("unacceptTrade throws before accept and sends after accept", async () => {
    const scene = tradeScene();
    const { rig } = scene;
    try {
      scene.opened();
      expect(() => rig.handle.act.unacceptTrade()).toThrow("not accepted");
      const accepted = rig.handle.act.acceptTrade();
      accepted.catch(() => undefined);
      await flush();
      const undone = rig.handle.act.unacceptTrade();
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildUnacceptTrade(),
        opcode: GameOpcode.CMSG_UNACCEPT_TRADE,
      });
      expect(await undone).toEqual({ unaccepted: true });
      expect(rig.handle.state().selfAccepted).toBe(false);
      rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(8, {}));
      await accepted.catch(() => undefined);
    } finally {
      rig.dispose();
    }
  });
});
