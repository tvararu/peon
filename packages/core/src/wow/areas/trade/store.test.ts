import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TRADE_PARTNER,
  TRADE_SELF,
  TRADE_STATUS,
  tradeRig,
  tradeStatusBody,
} from "#test-support/areas/trade";
import type { TradeStatus } from "#wow/areas/trade/protocol";
import { type TradeEvent, TradeStore } from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("trade store", () => {
  test("BEGIN_TRADE sets requested_in with the trader and emits requested", () => {
    const rig = tradeRig();
    const events: TradeEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER }),
      );
      expect(rig.handle.state()).toMatchObject({
        from: TRADE_PARTNER,
        phase: "requested_in",
      });
      expect(events).toEqual([{ from: TRADE_PARTNER, type: "requested" }]);
    } finally {
      rig.dispose();
    }
  });

  test("OPEN_WINDOW after the own requestTrade sets open and emits opened", () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    const events: TradeEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
      );
      expect(rig.handle.state()).toMatchObject({
        phase: "open",
        with: TRADE_PARTNER,
      });
      expect(events.map((event) => event.type)).toContain("opened");
    } finally {
      rig.dispose();
    }
  });

  test("a stale cancel reply is consumed without settling the request", () => {
    const rig = tradeRig();
    const events: TradeEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
      rig.stores.areas.trade.expectCancelReply(5000);
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(rig.handle.state().phase).toBe("requested_out");
      expect(events).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  function clockStore() {
    const clock = { now: 0 };
    const store = new TradeStore({
      getEntity: () => undefined,
      now: () => clock.now,
      selfGuid: () => TRADE_SELF,
      send: () => undefined,
      updateEntity: () => undefined,
    });
    const events: TradeEvent[] = [];
    store.onEvent((event) => events.push(event));
    return { clock, events, store };
  }

  const BUSY_STATUS: TradeStatus = {
    kind: "none",
    status: TRADE_STATUS.BUSY,
    statusName: "busy",
  };
  const IGNORE_YOU_STATUS: TradeStatus = {
    kind: "none",
    status: TRADE_STATUS.IGNORE_YOU,
    statusName: "ignore_you",
  };
  const CANCELED_STATUS: TradeStatus = {
    kind: "none",
    status: TRADE_STATUS.TRADE_CANCELED,
    statusName: "trade_canceled",
  };

  test("a cancel reply that never came does not swallow the next request's BUSY or IGNORE_YOU", () => {
    for (const status of [BUSY_STATUS, IGNORE_YOU_STATUS]) {
      const { clock, events, store } = clockStore();
      store.expectCancelReply(5000);
      store.abandon();
      clock.now = 61_000;
      store.beginRequest(TRADE_PARTNER);
      store.receiveStatus(status);
      expect(events).toEqual([{ status: status.statusName, type: "canceled" }]);
      expect(store.snapshot().lastOutcome).toEqual({
        kind: "canceled",
        status: status.statusName,
      });
    }
  });

  test("BUSY and IGNORE_YOU are never taken for the cancel reply, even inside the window", () => {
    for (const status of [BUSY_STATUS, IGNORE_YOU_STATUS]) {
      const { events, store } = clockStore();
      store.expectCancelReply(5000);
      store.beginRequest(TRADE_PARTNER);
      store.receiveStatus(status);
      expect(events).toEqual([{ status: status.statusName, type: "canceled" }]);
    }
  });

  test("the cancel reply is consumed once inside the window and not after it", () => {
    const { clock, events, store } = clockStore();
    store.expectCancelReply(5000);
    store.beginRequest(TRADE_PARTNER);
    clock.now = 4000;
    store.receiveStatus(CANCELED_STATUS);
    expect(events).toEqual([]);
    expect(store.snapshot().phase).toBe("requested_out");
    store.receiveStatus(CANCELED_STATUS);
    expect(events).toEqual([{ status: "trade_canceled", type: "canceled" }]);

    const late = clockStore();
    late.store.expectCancelReply(5000);
    late.store.beginRequest(TRADE_PARTNER);
    late.clock.now = 5001;
    late.store.receiveStatus(CANCELED_STATUS);
    expect(late.events).toEqual([
      { status: "trade_canceled", type: "canceled" },
    ]);
  });

  test("a later status of the next request ends the expectation of the cancel reply", () => {
    const { events, store } = clockStore();
    store.expectCancelReply(5000);
    store.beginRequest(TRADE_PARTNER);
    store.receiveStatus({
      kind: "open_window",
      status: TRADE_STATUS.OPEN_WINDOW,
      statusName: "open_window",
      tradeId: 0,
    });
    events.length = 0;
    store.receiveStatus(CANCELED_STATUS);
    expect(events).toEqual([{ status: "trade_canceled", type: "canceled" }]);
  });

  test("TRADE_CANCELED, BUSY and IGNORE_YOU close with canceled and emit canceled", () => {
    for (const [status, name] of [
      [TRADE_STATUS.TRADE_CANCELED, "trade_canceled"],
      [TRADE_STATUS.BUSY, "busy"],
      [TRADE_STATUS.IGNORE_YOU, "ignore_you"],
    ] as const) {
      const rig = tradeRig();
      try {
        rig.inject(
          GameOpcode.SMSG_TRADE_STATUS,
          tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, {
            trader: TRADE_PARTNER,
          }),
        );
        rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(status));
        const state = rig.handle.state();
        expect(state.phase).toBe("closed");
        expect(state.lastOutcome).toMatchObject({
          kind: "canceled",
          status: name,
        });
      } finally {
        rig.dispose();
      }
    }
  });

  test("NO_TARGET, TARGET_TO_FAR, WRONG_FACTION, YOU_DEAD and TRIAL_ACCOUNT refuse with the status name", () => {
    for (const [status, name] of [
      [TRADE_STATUS.NO_TARGET, "no_target"],
      [TRADE_STATUS.TARGET_TO_FAR, "target_to_far"],
      [TRADE_STATUS.WRONG_FACTION, "wrong_faction"],
      [TRADE_STATUS.YOU_DEAD, "you_dead"],
      [TRADE_STATUS.TARGET_DEAD, "target_dead"],
      [TRADE_STATUS.TARGET_STUNNED, "target_stunned"],
      [TRADE_STATUS.TARGET_LOGOUT, "target_logout"],
      [TRADE_STATUS.YOU_STUNNED, "you_stunned"],
      [TRADE_STATUS.YOU_LOGOUT, "you_logout"],
      [TRADE_STATUS.TRIAL_ACCOUNT, "trial_account"],
    ] as const) {
      const rig = tradeRig();
      const events: TradeEvent[] = [];
      rig.handle.onEvent((event) => events.push(event));
      try {
        rig.inject(GameOpcode.SMSG_TRADE_STATUS, tradeStatusBody(status));
        expect(rig.handle.state().lastOutcome).toMatchObject({
          kind: "refused",
          status: name,
        });
        expect(events.map((event) => event.type)).toContain("refused");
      } finally {
        rig.dispose();
      }
    }
  });

  test("a refusal after requestTrade frees the request so the next one may start", () => {
    const rig = areaRig("trade", { selfGuid: TRADE_SELF });
    try {
      rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
      expect(rig.handle.state().phase).toBe("requested_out");
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TARGET_TO_FAR),
      );
      expect(rig.handle.state()).toMatchObject({
        lastOutcome: { kind: "refused", status: "target_to_far" },
        phase: "idle",
        with: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("dispatch handles SMSG_TRADE_STATUS and the stub pair is gone", () => {
    const rig = tradeRig();
    try {
      expect(rig.dispatch.has(GameOpcode.SMSG_TRADE_STATUS)).toBe(true);
    } finally {
      rig.dispose();
    }
  });
});
