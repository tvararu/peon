import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TRADE_PARTNER,
  TRADE_SELF,
  TRADE_STATUS,
  tradeRig,
  tradeStatusBody,
} from "#test-support/areas/trade";
import type { TradeEvent } from "#wow/areas/trade/store";
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
