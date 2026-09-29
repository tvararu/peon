import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TRADE_PARTNER,
  TRADE_SELF,
  TRADE_STATUS,
  tradeStatusBody,
} from "#test-support/areas/trade";
import {
  buildBeginTrade,
  buildBusyTrade,
  buildIgnoreTrade,
  buildInitiateTrade,
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
