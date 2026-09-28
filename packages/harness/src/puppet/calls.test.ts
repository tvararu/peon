import { describe, expect, test } from "bun:test";
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
  test("keeps its keys sorted", () => {
    const keys = Object.keys(PUPPET_CALLS);
    expect(keys).toEqual([...keys].sort());
  });

  test("names only functions on the game handle", () => {
    const game = createMockGame() as unknown as Record<string, unknown>;
    for (const method of Object.keys(PUPPET_CALLS))
      expect(typeof game[method]).toBe("function");
  });

  test("runs the handle method with the decoded arguments", () => {
    const game = createMockGame();
    const call = decodeCall("rollLoot", '["42", 3, "need"]');
    if ("error" in call) throw new Error(call.error);
    PUPPET_CALLS["rollLoot"]?.run(game, call.args);
    expect(game.rollLoot).toHaveBeenCalledWith(42n, 3, "need");
  });
});
