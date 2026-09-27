import { describe, expect, test } from "bun:test";
import { guardNext } from "#harness/ops/next-guard";
import { parseCall } from "#harness/ops/repeat-guard";
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

  const sameCall = (call: { tool: string; args: Record<string, unknown> }) =>
    call.tool === "engage" && call.args["count"] === 2;

  test("a first PARTLY whose Next is the same call keeps it", () => {
    const guarded = guardNext(partly, {
      args: { count: 2, target: "Springpaw Stalker" },
      blocked: never,
      progressed: false,
      tool: "engage",
    });
    expect(guarded).toBe(partly);
  });

  test("a repeat with no progress from the same place asks the human", () => {
    const guarded = guardNext(partly, {
      args: { count: 2, target: "Springpaw Stalker" },
      blocked: sameCall,
      progressed: false,
      tool: "engage",
    });
    expect(guarded.next).toBe(
      'ask the human: "My engage call stopped (queue_exhausted) and repeating it will not help. What should I do?"',
    );
  });

  test("a repeat that made progress keeps its Next", () => {
    const guarded = guardNext(partly, {
      args: { count: 2, target: "Springpaw Stalker" },
      blocked: sameCall,
      progressed: true,
      tool: "engage",
    });
    expect(guarded).toBe(partly);
  });

  test.each([
    "loot_denied:release_only",
    "loot_denied:timeout",
    "loot_denied:loot_source_unavailable",
  ])("a quest engage stopped by %s may run again", (reason) => {
    const denied = result("PARTLY", {
      after: {},
      detail: "5 of 8 kills.",
      next: 'engage(quest: "8325")',
      reason,
    });
    expect(
      guardNext(denied, {
        args: { quest: "8325" },
        blocked: () => true,
        progressed: false,
        tool: "engage",
      }),
    ).toBe(denied);
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
      progressed: false,
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
      progressed: false,
      tool: "engage",
    });
    expect(other.next).toBe(partly.next);
    const done = result("DONE", { after: {}, detail: "ok.", next: "look()" });
    expect(
      guardNext(done, {
        args: {},
        blocked: () => true,
        progressed: false,
        tool: "look",
      }).next,
    ).toBe("look()");
    const rest = result("PARTLY", {
      after: {},
      detail: "rested 30 s.",
      next: "rest()",
      reason: "time_limit",
    });
    expect(
      guardNext(rest, {
        args: {},
        blocked: never,
        progressed: false,
        tool: "rest",
      }),
    ).toBe(rest);
  });

  test("a run stopped by something other than the human may be started again", () => {
    const stopped = result("FAILED", {
      after: {},
      detail: "the recovery was stopped (stopped_by_tool).",
      next: "recover()",
      reason: "cancelled",
    });
    expect(
      guardNext(stopped, {
        args: {},
        blocked: () => true,
        progressed: false,
        tool: "recover",
      }),
    ).toBe(stopped);
  });

  test("a quest engage that used up its starts may run again", () => {
    const capped = result("PARTLY", {
      after: {},
      detail: "1 of 8 kills (u9). Stopped: max_starts_reached.",
      next: 'engage(quest: "8325")',
      reason: "max_starts_reached",
    });
    expect(
      guardNext(capped, {
        args: { quest: "8325" },
        blocked: never,
        progressed: false,
        tool: "engage",
      }),
    ).toBe(capped);
  });
});
