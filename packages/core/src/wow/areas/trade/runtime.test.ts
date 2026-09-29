import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TRADE_LINEN,
  TRADE_PARTNER,
  TRADE_SELF,
  TRADE_STATUS,
  TRADE_SWORD,
  tradeScene,
  tradeStatusBody,
  tradeStatusExtendedBody,
} from "#test-support/areas/trade";
import {
  buildAcceptTrade,
  buildBeginTrade,
  buildBusyTrade,
  buildClearTradeItem,
  buildIgnoreTrade,
  buildInitiateTrade,
  buildSetTradeGold,
  buildSetTradeItem,
  buildUnacceptTrade,
} from "#wow/areas/trade/protocol";
import type { TradeEvent } from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function answeredRig() {
  const rig = areaRig("trade", { selfGuid: TRADE_SELF });
  rig.inject(
    GameOpcode.SMSG_TRADE_STATUS,
    tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER }),
  );
  return rig;
}

describe("trade request", () => {
  test("requestTrade sends CMSG_INITIATE_TRADE and settles ok on OPEN_WINDOW", async () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildInitiateTrade(TRADE_PARTNER),
          opcode: GameOpcode.CMSG_INITIATE_TRADE,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a refused status settles refused with the status name", async () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    const events: TradeEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await flush();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.NO_TARGET),
      );
      expect(await pending).toEqual({
        reason: "no_target",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("stun, death and logout refusals settle refused with the status name", async () => {
    for (const [status, name] of [
      [TRADE_STATUS.TARGET_DEAD, "target_dead"],
      [TRADE_STATUS.TARGET_STUNNED, "target_stunned"],
      [TRADE_STATUS.TARGET_LOGOUT, "target_logout"],
      [TRADE_STATUS.YOU_STUNNED, "you_stunned"],
      [TRADE_STATUS.YOU_LOGOUT, "you_logout"],
    ] as const) {
      const rig = areaRig("trade", { selfGuid: TRADE_SELF });
      try {
        const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
        await flush();
        rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(status));
        expect(await pending).toEqual({
          reason: name,
          status: "refused",
        });
        expect(rig.handle.state().phase).toBe("idle");
      } finally {
        rig.dispose();
      }
    }
  });

  test("no OPEN_WINDOW in 60 s sends CMSG_CANCEL_TRADE and settles unanswered", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(rig.sent).toHaveLength(1);
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(rig.sent.map((sent) => sent.opcode)).toContain(
        GameOpcode.CMSG_CANCEL_TRADE,
      );
      expect(await pending).toEqual({ status: "unanswered" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("canceling a pending request settles refused instead of ok", async () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await flush();
      const canceling = rig.handle.act.cancelTrade();
      await flush();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(await pending).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
      expect(await canceling).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a second requestTrade starts after settling ends", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(await pending).toEqual({ status: "unanswered" });
      expect(rig.handle.state().phase).toBe("settling");
      jest.advanceTimersByTime(5000);
      expect(rig.handle.state().phase).toBe("idle");
      const next = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
      );
      expect(await next).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a stray TRADE_CANCELED during settling ends it", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(await pending).toEqual({ status: "unanswered" });
      expect(rig.handle.state().phase).toBe("settling");
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(rig.handle.state().phase).toBe("idle");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a canceled status during a request applies to that request", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const first = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(await first).toEqual({ status: "unanswered" });
      expect(rig.handle.state().phase).toBe("settling");
      jest.advanceTimersByTime(5000);
      const next = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(await next).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
      expect(rig.handle.state().phase).toBe("closed");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a new BEGIN_TRADE after the timeout starts fresh and cancels within 5 s", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const first = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(await first).toEqual({ status: "unanswered" });
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER }),
      );
      expect(rig.handle.state().phase).toBe("requested_in");
      const canceling = rig.handle.act.answerTrade("busy");
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(await canceling).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
      expect(rig.handle.state().phase).toBe("closed");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("requestTrade throws while a trade is not idle or closed", () => {
    const rig = answeredRig();
    try {
      expect(() => rig.handle.act.requestTrade(TRADE_PARTNER)).toThrow(
        "a trade is already in progress",
      );
    } finally {
      rig.dispose();
    }
  });
});

describe("trade answer", () => {
  test("answerTrade yes sends CMSG_BEGIN_TRADE only in requested_in", async () => {
    const rig = answeredRig();
    try {
      const pending = rig.handle.act.answerTrade("yes");
      await flush();
      expect(rig.sent).toEqual([
        { body: buildBeginTrade(), opcode: GameOpcode.CMSG_BEGIN_TRADE },
      ]);
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("answerTrade busy and ignore send their opcode and settle on the reply", async () => {
    for (const [answer, opcode, body, status, result] of [
      [
        "busy",
        GameOpcode.CMSG_BUSY_TRADE,
        buildBusyTrade(),
        TRADE_STATUS.BUSY,
        { reason: "busy", status: "refused" },
      ],
      [
        "ignore",
        GameOpcode.CMSG_IGNORE_TRADE,
        buildIgnoreTrade(),
        TRADE_STATUS.IGNORE_YOU,
        { reason: "ignore_you", status: "refused" },
      ],
    ] as const) {
      const rig = answeredRig();
      try {
        const pending = rig.handle.act.answerTrade(answer);
        await flush();
        expect(rig.sent).toEqual([{ body, opcode }]);
        rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(status));
        expect(await pending).toEqual(result);
      } finally {
        rig.dispose();
      }
    }
  });

  test("answerTrade outside requested_in throws no_request", () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      for (const answer of ["yes", "busy", "ignore"] as const)
        expect(() => rig.handle.act.answerTrade(answer)).toThrow("no_request");
    } finally {
      rig.dispose();
    }
  });

  test("an unanswered request is answered busy after 60 s", async () => {
    jest.useFakeTimers();
    const rig = answeredRig();
    try {
      expect(rig.sent).toHaveLength(0);
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(rig.sent).toEqual([
        { body: buildBusyTrade(), opcode: GameOpcode.CMSG_BUSY_TRADE },
      ]);
      expect(rig.handle.state().phase).toBe("requested_in");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("answering clears the 60 s auto-busy timer", async () => {
    jest.useFakeTimers();
    const rig = answeredRig();
    try {
      const pending = rig.handle.act.answerTrade("busy");
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.BUSY),
      );
      await pending;
      jest.advanceTimersByTime(120_000);
      await Promise.resolve();
      expect(
        rig.sent.filter((sent) => sent.opcode === GameOpcode.CMSG_BUSY_TRADE),
      ).toHaveLength(1);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("trade cancel", () => {
  test("cancelTrade sends CMSG_CANCEL_TRADE in open, requested_in or requested_out", async () => {
    for (const setup of ["open", "requested_in", "requested_out"] as const) {
      const rig = areaRig("trade", { selfGuid: TRADE_SELF });
      try {
        if (setup === "requested_in")
          rig.inject(
            GameOpcode.SMSG_TRADE_STATUS,
            tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, {
              trader: TRADE_PARTNER,
            }),
          );
        if (setup === "requested_out")
          rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
        if (setup === "open") {
          rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
          rig.inject(
            GameOpcode.SMSG_TRADE_STATUS,
            tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
          );
        }
        await flush();
        const pending = rig.handle.act.cancelTrade();
        await flush();
        expect(rig.sent.map((sent) => sent.opcode)).toContain(
          GameOpcode.CMSG_CANCEL_TRADE,
        );
        rig.inject(
          GameOpcode.SMSG_TRADE_STATUS,
          tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
        );
        expect(await pending).toEqual({ status: "ok" });
      } finally {
        rig.dispose();
      }
    }
  });

  test("cancelTrade outside a trade throws", () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      expect(() => rig.handle.act.cancelTrade()).toThrow("no trade to cancel");
    } finally {
      rig.dispose();
    }
  });
});

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
