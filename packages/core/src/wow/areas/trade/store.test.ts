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

  test("TRADE_CANCELED during requested_out applies to that request", () => {
    const rig = tradeRig();
    const events: TradeEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      rig.handle.act.requestTrade(TRADE_PARTNER).catch(() => undefined);
      rig.inject(
        GameOpcode.SMSG_TRADE_STATUS,
        tradeStatusBody(TRADE_STATUS.TRADE_CANCELED),
      );
      expect(rig.handle.state().phase).toBe("closed");
      expect(events).toEqual([{ status: "trade_canceled", type: "canceled" }]);
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

  test("BUSY and IGNORE_YOU during a request close it as canceled", () => {
    for (const status of [BUSY_STATUS, IGNORE_YOU_STATUS]) {
      const { events, store } = clockStore();
      store.beginRequest(TRADE_PARTNER);
      store.receiveStatus(status);
      expect(events).toEqual([{ status: status.statusName, type: "canceled" }]);
      expect(store.snapshot().lastOutcome).toEqual({
        kind: "canceled",
        status: status.statusName,
      });
    }
  });

  test("TRADE_CANCELED while idle changes nothing and is counted", () => {
    const { events, store } = clockStore();
    store.beginRequest(TRADE_PARTNER);
    store.abandon();
    const before = store.snapshot();
    store.receiveStatus(CANCELED_STATUS);
    expect(events).toEqual([]);
    expect(store.snapshot()).toEqual({ ...before, dropped: 1 });
  });

  test("BEGIN_TRADE always starts a fresh incoming request", () => {
    const { events, store } = clockStore();
    store.beginRequest(TRADE_PARTNER);
    store.abandon();
    store.receiveStatus({
      kind: "trader",
      status: TRADE_STATUS.BEGIN_TRADE,
      statusName: "begin_trade",
      trader: TRADE_PARTNER,
    });
    expect(store.snapshot()).toMatchObject({
      from: TRADE_PARTNER,
      phase: "requested_in",
    });
    expect(events).toEqual([{ from: TRADE_PARTNER, type: "requested" }]);
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

  test("an EXTENDED from their side replaces theirOffer, raises the version and emits offer_changed", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    const before = store.snapshot().theirOffer.version;
    store.receiveExtended({
      gold: 40,
      items: [],
      side: 1,
      spell: 0,
      tradeId: 1,
    });
    const after = store.snapshot();
    expect(after.theirOffer.gold).toBe(40);
    expect(after.theirOffer.version).toBe(before + 1);
    expect(events.map((event) => event.type)).toEqual([
      "opened",
      "offer_changed",
    ]);
  });

  test("an EXTENDED of the own side is kept as ownEcho, not ownOffer", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    store.recordOwnOffer({ gold: 10, items: [] });
    store.receiveExtended({
      gold: 40,
      items: [],
      side: 0,
      spell: 0,
      tradeId: 1,
    });
    const state = store.snapshot();
    expect(state.ownOffer.gold).toBe(10);
    expect(state.ownEcho?.gold).toBe(40);
    expect(events.map((event) => event.type)).toEqual(["opened"]);
  });

  test("BACK_TO_TRADE clears both accept flags, raises the version and emits back_to_trade", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    store.noteTheyAccepted();
    const before = store.snapshot().theirOffer.version;
    store.receiveStatus({
      kind: "none",
      status: 7,
      statusName: "back_to_trade",
    });
    expect(store.snapshot()).toMatchObject({
      selfAccepted: false,
      theyAccepted: false,
    });
    expect(store.snapshot().theirOffer.version).toBe(before + 1);
    expect(events).toContainEqual({ type: "back_to_trade" });
  });

  test("TRADE_ACCEPT sets theyAccepted and emits they_accepted", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    store.receiveStatus({
      kind: "none",
      status: 4,
      statusName: "trade_accept",
    });
    expect(store.snapshot().theyAccepted).toBe(true);
    expect(events).toContainEqual({ type: "they_accepted" });
  });

  test("TRADE_COMPLETE snapshots both offers into a completed outcome and emits completed", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    store.recordOwnOffer({ gold: 10, items: [] });
    store.receiveExtended({
      gold: 40,
      items: [],
      side: 1,
      spell: 0,
      tradeId: 1,
    });
    store.receiveStatus({
      kind: "none",
      status: 8,
      statusName: "trade_complete",
    });
    expect(store.snapshot().lastOutcome).toEqual({
      gave: { gold: 10, items: [], spell: 0, version: 1 },
      got: { gold: 40, items: [], spell: 0, version: 1 },
      kind: "completed",
    });
    expect(events).toContainEqual({
      gave: { gold: 10, items: [], spell: 0, version: 1 },
      got: { gold: 40, items: [], spell: 0, version: 1 },
      type: "completed",
    });
  });

  test("CLOSE_WINDOW records the named refusal fields from the packet (TradeHandler.cpp:431-460)", () => {
    const { events, store } = clockStore();
    store.receiveStatus({
      kind: "open_window",
      status: 2,
      statusName: "open_window",
      tradeId: 1,
    });
    store.receiveStatus({
      isTarget: true,
      kind: "close_window",
      limitItem: 2589,
      result: 50,
      status: 12,
      statusName: "close_window",
    });
    expect(store.snapshot().lastOutcome).toEqual({
      equipResult: 50,
      kind: "refused",
      limitItem: 2589,
      status: "close_window",
      targetError: true,
    });
    expect(events).toContainEqual({ type: "refused", status: "close_window" });
  });
});
