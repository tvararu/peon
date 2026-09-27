import { describe, expect, test } from "bun:test";
import { guardNext, parseCall } from "#harness/ops/next-guard";
import { result } from "#harness/tools/define";

const never = () => false;

describe("parseCall", () => {
  test.each([
    ["look()", { args: {}, tool: "look" }],
    [
      'engage(count: 2, target: "Springpaw Stalker")',
      { args: { count: 2, target: "Springpaw Stalker" }, tool: "engage" },
    ],
    [
      'travel(to: "8735, -6685")',
      { args: { to: "8735, -6685" }, tool: "travel" },
    ],
    ["loot(all: true)", { args: { all: true }, tool: "loot" }],
  ])("%s", (text, want) => {
    expect(parseCall(text)).toEqual(want);
  });

  test.each([
    'rest(), then engage(target: "u9")',
    'ask the human: "Where?"',
    "end your turn and wait for the human.",
  ])("%s is not one call", (text) => {
    expect(parseCall(text)).toBeUndefined();
  });
});

describe("guardNext", () => {
  const partly = result("PARTLY", {
    after: {},
    detail: "2 of 3 kills.",
    next: 'engage(count: 2, target: "Springpaw Stalker")',
    reason: "queue_exhausted",
  });

  test("a PARTLY whose Next is the same call asks the human instead", () => {
    const guarded = guardNext(partly, {
      args: { count: 2, target: "Springpaw Stalker" },
      blocked: never,
      tool: "engage",
    });
    expect(guarded.next).toBe(
      'ask the human: "My engage call stopped (queue_exhausted) and repeating it will not help. What should I do?"',
    );
  });

  test("a Next the repeat guard would block asks the human instead", () => {
    const failed = result("FAILED", {
      after: {},
      detail: "could not reach Ranger Degolien (u14).",
      next: 'travel(to: "u14")',
      reason: "no_ground",
    });
    const guarded = guardNext(failed, {
      args: { do: "talk", npc: "u14" },
      blocked: (call) => call.tool === "travel" && call.args["to"] === "u14",
      tool: "interact",
    });
    expect(guarded.next).toBe(
      'ask the human: "My interact call failed (no_ground) and travel already failed from here. What should I do?"',
    );
  });

  test("a different call, a DONE and a timed rest keep their Next", () => {
    const other = guardNext(partly, {
      args: { count: 3, target: "Springpaw Stalker" },
      blocked: never,
      tool: "engage",
    });
    expect(other.next).toBe(partly.next);
    const done = result("DONE", { after: {}, detail: "ok.", next: "look()" });
    expect(
      guardNext(done, { args: {}, blocked: () => true, tool: "look" }).next,
    ).toBe("look()");
    const rest = result("PARTLY", {
      after: {},
      detail: "rested 30 s.",
      next: "rest()",
      reason: "time_limit",
    });
    expect(guardNext(rest, { args: {}, blocked: never, tool: "rest" })).toBe(
      rest,
    );
  });
});
