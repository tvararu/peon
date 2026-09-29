import { describe, expect, spyOn, test } from "bun:test";
import { AREA_NAMES } from "@peon/core";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";
import { createMockGame } from "#test-support/mock-game";

function areaActs(game: object, area: string): object | undefined {
  const view: unknown = Reflect.get(game, area);
  if (typeof view !== "object" || view === null || !("act" in view)) return;
  const acts = view.act;
  return typeof acts === "object" && acts !== null ? acts : undefined;
}

const ALIASES: Readonly<Record<string, readonly [string, string]>> = {
  tradeAccept: ["trade", "acceptTrade"],
  tradeAnswer: ["trade", "answerTrade"],
  tradeCancel: ["trade", "cancelTrade"],
  tradeOffer: ["trade", "offerItem"],
  tradeRequest: ["trade", "requestTrade"],
};

const HANDLE_ALIASES: Readonly<Record<string, string>> = {
  walkToPlayer: "walkTowardPoint",
};

function callable(game: object, method: string): boolean {
  const member = HANDLE_ALIASES[method];
  if (member) return typeof Reflect.get(game, member) === "function";
  const aliased = ALIASES[method];
  if (aliased) {
    const acts = areaActs(game, aliased[0]);
    return (
      acts !== undefined && typeof Reflect.get(acts, aliased[1]) === "function"
    );
  }
  if (typeof Reflect.get(game, method) === "function") return true;
  return AREA_NAMES.some((area) => {
    const acts = areaActs(game, area);
    return (
      acts !== undefined && typeof Reflect.get(acts, method) === "function"
    );
  });
}

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
  test("keeps its keys sorted", () => {
    const keys = Object.keys(PUPPET_CALLS);
    expect(keys).toEqual([...keys].sort());
  });

  test("names only functions or area acts on the game handle", () => {
    const game = createMockGame();
    for (const method of Object.keys(PUPPET_CALLS))
      expect(callable(game, method)).toBe(true);
  });

  test("reaches the inert acts of the mock game's area handles", () => {
    const game = createMockGame();
    expect(AREA_NAMES.every((area) => areaActs(game, area))).toBe(true);
    expect(callable(game, "query")).toBe(true);
  });

  test("runs the handle method with the decoded arguments", () => {
    const game = createMockGame();
    const call = decodeCall("rollLoot", '["42", 3, "need"]');
    if ("error" in call) throw new Error(call.error);
    PUPPET_CALLS["rollLoot"]?.run(game, call.args);
    expect(game.rollLoot).toHaveBeenCalledWith(42n, 3, "need");
  });

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
});
