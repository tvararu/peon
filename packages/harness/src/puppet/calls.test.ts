import { describe, expect, spyOn, test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";
import { createMockGame } from "#test-support/mock-game";

describe("decodeCall", () => {
  test("keeps the method and its string arguments", () => {
    expect(decodeCall("invite", '["Fabc"]')).toEqual({
      args: ["Fabc"],
      method: "invite",
    });
  });

  test("turns a guid string into a bigint", () => {
    expect(decodeCall("selectTarget", '["42"]')).toEqual({
      args: [42n],
      method: "selectTarget",
    });
  });

  test("takes no JSON as no arguments", () => {
    expect(decodeCall("acceptInvite", undefined)).toEqual({
      args: [],
      method: "acceptInvite",
    });
  });

  test("reads a loot roll's guid, slot and vote", () => {
    expect(
      decodeCall("rollLoot", '["18446744073709551615", 2, "greed"]'),
    ).toEqual({
      args: [18446744073709551615n, 2, "greed"],
      method: "rollLoot",
    });
  });

  test.each<[string, string | undefined]>([
    ["walk", "[]"],
    ["toString", undefined],
    ["invite", '{"name":"Fabc"}'],
    ["invite", "not json"],
    ["invite", "[]"],
    ["invite", '["Fabc", "Fdef"]'],
    ["invite", "[7]"],
    ["selectTarget", "[42]"],
    ["selectTarget", '["0x2a"]'],
    ["selectTarget", '["-1"]'],
    ["rollLoot", '["42", 1.5, "need"]'],
    ["rollLoot", '["42", 1, "maybe"]'],
  ])("refuses %p with %p", (method, json) => {
    expect(decodeCall(method, json)).toHaveProperty("error");
  });
});

describe("PUPPET_CALLS", () => {
  test("walks toward a named nearby player until it is close", async () => {
    const game = createMockGame();
    const row = {
      distance: 17,
      entity: { guid: 7n, name: "Fabc", objectType: 4 },
      position: { x: 1, y: 2, z: 3 },
      self: false,
    };
    spyOn(game, "queryNearby").mockReturnValue([row] as never);
    const walk = spyOn(game, "walkTowardPoint").mockResolvedValue({
      pose: undefined,
      reason: "arrived",
      status: "arrived",
      traveled: 14,
    } as never);
    const call = decodeCall("walkToPlayer", '["fabc"]');
    if ("error" in call) throw new Error(call.error);
    await PUPPET_CALLS["walkToPlayer"]?.run(game, call.args);
    expect(walk).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 14);
  });

  test("refuses to walk toward a player who is not nearby", () => {
    const game = createMockGame();
    spyOn(game, "queryNearby").mockReturnValue([]);
    const call = decodeCall("walkToPlayer", '["Fabc"]');
    if ("error" in call) throw new Error(call.error);
    expect(PUPPET_CALLS["walkToPlayer"]?.run(game, call.args)).rejects.toThrow(
      "No nearby player named Fabc.",
    );
  });

  test("tradeRequestQuiet waits out an unanswered request", async () => {
    const game = createMockGame();
    const row = {
      distance: 2,
      entity: { guid: 7n, name: "Fabc", objectType: 4 },
      position: { x: 1, y: 2, z: 3 },
      self: false,
    };
    spyOn(game, "queryNearby").mockReturnValue([row] as never);
    spyOn(game.trade.act, "requestTrade").mockResolvedValue({
      status: "unanswered",
    });
    const call = decodeCall("tradeRequestQuiet", '["Fabc"]');
    if ("error" in call) throw new Error(call.error);
    expect(
      await PUPPET_CALLS["tradeRequestQuiet"]?.run(game, call.args),
    ).toBeUndefined();
    expect(game.trade.act.requestTrade).toHaveBeenCalledWith(7n);
  });

  function quietGame(outcome: unknown) {
    const game = createMockGame();
    const row = {
      distance: 2,
      entity: { guid: 7n, name: "Fabc", objectType: 4 },
      position: { x: 1, y: 2, z: 3 },
      self: false,
    };
    spyOn(game, "queryNearby").mockReturnValue([row] as never);
    spyOn(game.trade.act, "requestTrade").mockResolvedValue(outcome as never);
    const call = decodeCall("tradeRequestQuiet", '["Fabc"]');
    if ("error" in call) throw new Error(call.error);
    return { args: call.args, game };
  }

  test.each(["busy", "trade_canceled"])(
    "tradeRequestQuiet tolerates the %s decline",
    async (reason) => {
      const { args, game } = quietGame({ reason, status: "refused" });
      expect(
        await PUPPET_CALLS["tradeRequestQuiet"]?.run(game, args),
      ).toBeUndefined();
    },
  );

  test("tradeRequestQuiet still fails on other refusals", async () => {
    const { args, game } = quietGame({
      reason: "ignore_you",
      status: "refused",
    });
    await expect(
      PUPPET_CALLS["tradeRequestQuiet"]?.run(game, args),
    ).rejects.toThrow("trade_refused: ignore_you");
  });

  test("tradeAnswer waits for a request before it answers", () =>
    withFakeTimers(async () => {
      const game = createMockGame();
      const phase = spyOn(game.trade, "state");
      phase.mockReturnValue({ phase: "idle" } as never);
      const answer = spyOn(game.trade.act, "answerTrade").mockResolvedValue({
        status: "ok",
      });
      const call = decodeCall("tradeAnswer", '["yes"]');
      if ("error" in call) throw new Error(call.error);
      const done = PUPPET_CALLS["tradeAnswer"]?.run(game, call.args);
      await elapse(3000);
      expect(answer).not.toHaveBeenCalled();
      phase.mockReturnValue({ phase: "requested_in" } as never);
      await elapse(1000);
      await done;
      expect(answer).toHaveBeenCalledWith("yes");
    }));

  test("tradeAnswer fails when no request comes in time", () =>
    withFakeTimers(async () => {
      const game = createMockGame();
      spyOn(game.trade, "state").mockReturnValue({ phase: "idle" } as never);
      const call = decodeCall("tradeAnswer", '["yes"]');
      if ("error" in call) throw new Error(call.error);
      const done = PUPPET_CALLS["tradeAnswer"]?.run(game, call.args);
      const failure = Promise.resolve(done).catch((error: Error) => error);
      await elapse(61_000);
      expect(await failure).toHaveProperty("message", "no_request");
    }));

  test("tradeAcceptOffered accepts once the other side offers", () =>
    withFakeTimers(async () => {
      const game = createMockGame();
      const empty = { gold: 0, items: [], version: 1 };
      const state = spyOn(game.trade, "state");
      state.mockReturnValue({ theirOffer: empty } as never);
      const accept = spyOn(game.trade.act, "acceptTrade").mockResolvedValue({
        status: "ok",
      });
      const call = decodeCall("tradeAcceptOffered", "[]");
      if ("error" in call) throw new Error(call.error);
      const done = PUPPET_CALLS["tradeAcceptOffered"]?.run(game, call.args);
      await elapse(3000);
      expect(accept).not.toHaveBeenCalled();
      state.mockReturnValue({
        theirOffer: { gold: 0, items: [{}], version: 4 },
      } as never);
      await elapse(1000);
      await done;
      expect(accept).toHaveBeenCalledWith(4);
    }));
  test("signCharter signs the offered charter", async () => {
    const game = createMockGame();
    const sign = spyOn(game.charters.act, "sign").mockResolvedValue({
      status: "ok",
    });
    const call = decodeCall("signCharter", '["4611686018427387905"]');
    if ("error" in call) throw new Error(call.error);
    await PUPPET_CALLS["signCharter"]?.run(game, call.args);
    expect(sign).toHaveBeenCalledWith(0x40_00_00_00_00_00_00_01n);
  });

  test("declineCharter declines the offered charter", async () => {
    const game = createMockGame();
    const decline = spyOn(game.charters.act, "decline").mockResolvedValue({
      status: "ok",
    });
    const call = decodeCall("declineCharter", '["4611686018427387905"]');
    if ("error" in call) throw new Error(call.error);
    await PUPPET_CALLS["declineCharter"]?.run(game, call.args);
    expect(decline).toHaveBeenCalledWith(0x40_00_00_00_00_00_00_01n);
  });

  test("offerCharter offers the charter to the target", async () => {
    const game = createMockGame();
    const offer = spyOn(game.charters.act, "offer").mockResolvedValue({
      status: "ok",
    });
    const call = decodeCall("offerCharter", '["4611686018427387905", "3072"]');
    if ("error" in call) throw new Error(call.error);
    await PUPPET_CALLS["offerCharter"]?.run(game, call.args);
    expect(offer).toHaveBeenCalledWith(0x40_00_00_00_00_00_00_01n, 0x0c_00n);
  });
});
