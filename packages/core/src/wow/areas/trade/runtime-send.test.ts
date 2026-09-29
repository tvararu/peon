import { describe, expect, jest, test } from "bun:test";
import { TRADE_PARTNER, TRADE_SELF } from "#test-support/areas/trade";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { TradeStatus } from "#wow/areas/trade/protocol";
import { tradeRuntime } from "#wow/areas/trade/runtime";
import { type TradeEvent, TradeStore } from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

const OPEN_WINDOW: TradeStatus = {
  kind: "open_window",
  status: 2,
  statusName: "open_window",
  tradeId: 0,
};

const BEGIN_TRADE: TradeStatus = {
  kind: "trader",
  status: 1,
  statusName: "begin_trade",
  trader: TRADE_PARTNER,
};

function rig() {
  const store = new TradeStore({
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => TRADE_SELF,
    send: () => undefined,
    updateEntity: () => undefined,
  });
  const lifetime = new AbortController();
  const state = { broken: true, waiters: 0, sent: [] as number[] };
  const ctx: AreaRuntimeCtx<TradeEvent> = {
    dbc: undefined,
    expect: () => Promise.reject(new Error("no server")),
    legacy: {
      channels: () => [],
      friends: () => [],
      guild: () => undefined,
      ignored: () => [],
      party: () => {
        throw new Error("unused");
      },
    },
    listen: () => () => undefined,
    now: () => 0,
    selfGuid: () => TRADE_SELF,
    send: (opcode) => {
      if (state.broken) throw new Error("world socket is not connected");
      state.sent.push(opcode);
    },
    signal: lifetime.signal,
    until: (match, options) =>
      new Promise((resolve, reject) => {
        state.waiters += 1;
        let done = false;
        const finish = (settle: () => void) => {
          if (done) return;
          done = true;
          state.waiters -= 1;
          off();
          settle();
        };
        const off = store.onEvent((event) => {
          if (match(event)) finish(() => resolve(event));
        });
        options.signal?.addEventListener(
          "abort",
          () => finish(() => reject(new Error("aborted"))),
          { once: true },
        );
      }),
  };
  const runtime = tradeRuntime(ctx, store, {} as CoreStores);
  return { runtime, state, store };
}

describe("trade send failure", () => {
  test("a failed initiate send releases the waiter and allows a retry", async () => {
    const { runtime, state, store } = rig();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(runtime.act.requestTrade(TRADE_PARTNER)).rejects.toThrow(
        "world socket is not connected",
      );
      expect(unhandled).toEqual([]);
      expect(state.waiters).toBe(0);
      expect(store.snapshot().phase).toBe("idle");
      state.broken = false;
      const retry = runtime.act.requestTrade(TRADE_PARTNER);
      expect(state.sent).toEqual([GameOpcode.CMSG_INITIATE_TRADE]);
      store.receiveStatus(OPEN_WINDOW);
      expect(await retry).toEqual({ status: "ok" });
    } finally {
      process.off("unhandledRejection", onUnhandled);
      runtime.dispose();
    }
  });

  test("a failed busy answer releases the waiter and keeps the request", async () => {
    const { runtime, state, store } = rig();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      store.receiveStatus(BEGIN_TRADE);
      await expect(runtime.act.answerTrade("busy")).rejects.toThrow(
        "world socket is not connected",
      );
      expect(unhandled).toEqual([]);
      expect(state.waiters).toBe(0);
      expect(store.snapshot().phase).toBe("requested_in");
    } finally {
      process.off("unhandledRejection", onUnhandled);
      runtime.dispose();
    }
  });

  test("a failed auto-busy send releases the request instead of stalling", async () => {
    jest.useFakeTimers();
    const { runtime, store } = rig();
    try {
      store.receiveStatus(BEGIN_TRADE);
      expect(store.snapshot().phase).toBe("requested_in");
      jest.advanceTimersByTime(60_100);
      await Promise.resolve();
      expect(store.snapshot().phase).toBe("idle");
    } finally {
      runtime.dispose();
      jest.useRealTimers();
    }
  });
});
