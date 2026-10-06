import { describe, expect, jest, test } from "bun:test";
import { type AreaRig, areaRig } from "#test-support/area-rig";
import {
  TRADE_PARTNER,
  TRADE_SELF,
  TRADE_STATUS,
  type TradeStatusExtra,
  tradeStatusBody,
} from "#test-support/areas/trade";
import { GameOpcode } from "#wow/protocol/opcodes";

const advance = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
};

function status(
  rig: AreaRig<"trade">,
  kind: number,
  fields?: TradeStatusExtra,
) {
  rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(kind, fields));
}

const cancelsCount = (rig: AreaRig<"trade">): number =>
  rig.sent.filter((sent) => sent.opcode === GameOpcode.CMSG_CANCEL_TRADE)
    .length;

function startRequest(): AreaRig<"trade"> {
  const rig = areaRig("trade", { selfGuid: TRADE_SELF });
  void rig.handle.act.requestTrade(TRADE_PARTNER);
  jest.advanceTimersByTime(0);
  return rig;
}

function settleTimeout(): void {
  jest.advanceTimersByTime(60_000);
}

describe("trade settling after a request timeout", () => {
  test("the phase is settling and requestTrade refuses busy", async () => {
    jest.useFakeTimers();
    const rig = startRequest();
    settleTimeout();
    try {
      expect(rig.handle.state().phase).toBe("settling");
      const sentBefore = rig.sent.length;
      expect(await rig.handle.act.requestTrade(TRADE_PARTNER)).toEqual({
        reason: "busy",
        status: "refused",
      });
      expect(rig.sent).toHaveLength(sentBefore);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("TRADE_CANCELED ends settling and a new request can start", async () => {
    jest.useFakeTimers();
    const rig = startRequest();
    settleTimeout();
    try {
      status(rig, TRADE_STATUS.TRADE_CANCELED);
      expect(rig.handle.state().phase).toBe("idle");
      const next = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      expect(await next).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("5 seconds without a reply also end settling", async () => {
    jest.useFakeTimers();
    const rig = startRequest();
    settleTimeout();
    try {
      jest.advanceTimersByTime(4998);
      expect(rig.handle.state().phase).toBe("settling");
      jest.advanceTimersByTime(2);
      expect(rig.handle.state().phase).toBe("idle");
      const next = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      expect(await next).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a refusal or an opening while settling is dropped", async () => {
    jest.useFakeTimers();
    const rig = startRequest();
    settleTimeout();
    try {
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      status(rig, TRADE_STATUS.NO_TARGET);
      expect(rig.handle.state()).toMatchObject({
        dropped: 2,
        phase: "settling",
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("a local cancel settles", () => {
  test("cancelTrade during a request enters settling and refuses busy", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      const canceling = rig.handle.act.cancelTrade();
      await advance(0);
      expect(rig.handle.state().phase).toBe("settling");
      expect(await rig.handle.act.requestTrade(TRADE_PARTNER)).toEqual({
        reason: "busy",
        status: "refused",
      });
      status(rig, TRADE_STATUS.TRADE_CANCELED);
      expect(await canceling).toEqual({ status: "ok" });
      expect(await pending).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
      expect(rig.handle.state().phase).toBe("idle");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("no reply within 5 seconds settles locally to idle", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      jest.advanceTimersByTime(0);
      const canceling = rig.handle.act.cancelTrade();
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      expect(await canceling).toEqual({ status: "unanswered" });
      expect(rig.handle.state().phase).toBe("idle");
      expect(cancelsCount(rig)).toBe(1);
      jest.advanceTimersByTime(60_000);
      expect(await pending).toEqual({ status: "unanswered" });
      expect(cancelsCount(rig)).toBe(1);
      const next = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      expect(await next).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("an opening while the cancel is unanswered does not settle the request ok", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      const canceling = rig.handle.act.cancelTrade();
      await advance(0);
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      expect(rig.handle.state().phase).toBe("settling");
      status(rig, TRADE_STATUS.TRADE_CANCELED);
      expect(await canceling).toEqual({ status: "ok" });
      expect(await pending).toEqual({
        reason: "trade_canceled",
        status: "refused",
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("an incoming request supersedes an outgoing wait", () => {
  test("BEGIN_TRADE settles the request superseded and starts requested_in", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      status(rig, TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER });
      expect(await pending).toEqual({ status: "superseded" });
      expect(rig.handle.state()).toMatchObject({
        from: TRADE_PARTNER,
        phase: "requested_in",
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("the incoming request's opening never settles the old request ok", async () => {
    jest.useFakeTimers();
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      const pending = rig.handle.act.requestTrade(TRADE_PARTNER);
      await advance(0);
      status(rig, TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER });
      const answering = rig.handle.act.answerTrade("yes");
      await advance(0);
      status(rig, TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 });
      expect(await answering).toEqual({ status: "ok" });
      expect(await pending).toEqual({ status: "superseded" });
      expect(rig.handle.state().phase).toBe("open");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("BEGIN_TRADE while settling ends settling and starts requested_in", async () => {
    jest.useFakeTimers();
    const rig = startRequest();
    settleTimeout();
    try {
      status(rig, TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER });
      expect(rig.handle.state().phase).toBe("requested_in");
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      expect(rig.handle.state().phase).toBe("requested_in");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
