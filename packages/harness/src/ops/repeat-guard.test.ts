import { describe, expect, test } from "bun:test";
import type { ToolResult } from "#harness/contract/result";
import type { RepeatCall } from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import {
  CONTINUES,
  createRepeatGuard,
  REPEAT_MOVE_YD,
  repeatRefusal,
  TIME_CODES,
} from "#harness/ops/repeat-guard";

function pose(x: number): PoseView {
  return {
    ageMs: 0,
    facing: "N",
    mapId: 530,
    serverFixAgeMs: 0,
    source: "server",
    x,
    y: 0,
    z: 0,
  };
}

function call(over: Partial<RepeatCall> = {}): RepeatCall {
  return {
    args: { npc: "u3" },
    digest: "d1",
    pose: pose(0),
    tool: "interact",
    ...over,
  };
}

function outcome(
  status: ToolResult<unknown>["status"],
  reason?: string,
  next?: string,
): ToolResult<unknown> {
  return { after: undefined, body: [], detail: "x.", next, reason, status };
}

function guardAt(now: { t: number }) {
  return createRepeatGuard({ now: () => now.t });
}

describe("createRepeatGuard", () => {
  test("blocks the same failed call from the same place", () => {
    const guard = guardAt({ t: 0 });
    expect(guard.check(call())).toBeUndefined();
    guard.record({
      ...call(),
      result: outcome("REFUSED", "too_far", 'travel(to: "u3")'),
    });
    expect(guard.check(call())).toEqual({
      reason: "too_far",
      times: 2,
      untried: ['travel(to: "u3")'],
    });
    expect(guard.hits()).toBe(1);
  });

  test("treats args with other key order as the same call", () => {
    const guard = guardAt({ t: 0 });
    const reordered = Object.fromEntries([
      ["npc", "u3"],
      ["do", "buy"],
    ]);
    guard.record({
      ...call({ args: { do: "buy", npc: "u3" } }),
      result: outcome("FAILED", "not_enough_money"),
    });
    expect(guard.check(call({ args: reordered }))?.reason).toBe(
      "not_enough_money",
    );
  });

  test("a move of REPEAT_MOVE_YD or more clears the block", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    expect(
      guard.check(call({ pose: pose(REPEAT_MOVE_YD - 0.5) })),
    ).toBeDefined();
    expect(guard.check(call({ pose: pose(REPEAT_MOVE_YD) }))).toBeUndefined();
  });

  test("a changed progress digest clears the block", () => {
    const guard = guardAt({ t: 0 });
    guard.record({
      ...call({ args: {}, tool: "engage" }),
      result: outcome("REFUSED", "low_health", "rest()"),
    });
    expect(
      guard.check(call({ args: {}, digest: "d2", tool: "engage" })),
    ).toBeUndefined();
  });

  test("time codes and repeat refusals are never stored", () => {
    const guard = guardAt({ t: 0 });
    for (const reason of [...TIME_CODES, "repeat"])
      guard.record({ ...call(), result: outcome("REFUSED", reason) });
    expect(guard.check(call())).toBeUndefined();
  });

  test("a DONE of another action clears every failure, a DONE of look does not", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    guard.record({
      ...call({ args: {}, tool: "look" }),
      result: outcome("DONE"),
    });
    expect(guard.check(call())).toBeDefined();
    guard.record({
      ...call({ args: {}, tool: "rest" }),
      result: outcome("DONE"),
    });
    expect(guard.check(call())).toBeUndefined();
  });

  test("look is never blocked", () => {
    const guard = guardAt({ t: 0 });
    guard.record({
      ...call({ args: {}, tool: "look" }),
      result: outcome("FAILED", "error"),
    });
    expect(guard.check(call({ args: {}, tool: "look" }))).toBeUndefined();
  });

  test("a failure stops blocking after 5 minutes", () => {
    const now = { t: 0 };
    const guard = guardAt(now);
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    now.t = 300_001;
    expect(guard.check(call())).toBeUndefined();
  });

  test("a PARTLY blocks its Next from here but is never refused", () => {
    const guard = guardAt({ t: 0 });
    const walk = call({ args: { to: "explore" }, tool: "travel" });
    guard.record({
      ...walk,
      result: outcome("PARTLY", "obstructed", 'travel(to: "explore")'),
    });
    expect(guard.check(walk)).toBeUndefined();
    expect(guard.blocks(walk)).toBe(true);
    expect(guard.blocks({ ...walk, digest: "d2" })).toBe(false);
    expect(guard.hits()).toBe(0);
  });

  test("a continuation is never stored", () => {
    const guard = guardAt({ t: 0 });
    for (const reason of CONTINUES) {
      const walk = call({ args: { reason }, tool: "engage" });
      guard.record({ ...walk, result: outcome("PARTLY", reason) });
      guard.record({ ...walk, result: outcome("FAILED", reason) });
      expect(guard.blocks(walk)).toBe(false);
    }
  });

  test("untried leaves out the call it refuses", () => {
    const guard = guardAt({ t: 0 });
    const fight = call({ args: { target: "u9" }, tool: "engage" });
    guard.record({
      ...fight,
      result: outcome("FAILED", "lost", 'engage(target: "u9")'),
    });
    expect(guard.check(fight)?.untried).toEqual([]);
  });

  test("untried lists distinct next texts, newest first, at most 3", () => {
    const now = { t: 0 };
    const guard = guardAt(now);
    const nexts = ["a()", "b()", "c()", "d()"];
    for (const [index, next] of nexts.entries()) {
      now.t += 1;
      guard.record({
        ...call({ args: { n: index } }),
        result: outcome("REFUSED", "too_far", next),
      });
    }
    now.t += 1;
    guard.record({
      ...call({ args: { n: 9 } }),
      result: outcome("REFUSED", "too_far", "d()"),
    });
    expect(guard.check(call({ args: { n: 9 } }))?.untried).toEqual([
      "d()",
      "c()",
      "b()",
    ]);
  });
});

describe("repeatRefusal", () => {
  test("names the failure and the untried options", () => {
    const refusal = repeatRefusal({
      hit: { reason: "too_far", times: 2, untried: ['travel(to: "u3")'] },
      tool: "interact",
    });
    expect(refusal.reason).toBe("repeat");
    expect(refusal.status).toBe("REFUSED");
    expect(refusal.detail).toBe(
      "you already tried this from here and it failed (too_far).",
    );
    expect(refusal.body).toEqual(['Untried: travel(to: "u3")']);
    expect(refusal.next).toBe('travel(to: "u3")');
  });

  test("asks the human when nothing is untried", () => {
    const refusal = repeatRefusal({
      hit: { reason: "no_ground", times: 3, untried: [] },
      tool: "travel",
    });
    expect(refusal.body).toEqual([]);
    expect(refusal.next).toBe(
      'ask the human: "My travel call keeps failing (no_ground). What should I do?"',
    );
  });
});
