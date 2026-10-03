import { describe, expect, test } from "bun:test";
import type { GameLogEntry } from "#harness/contract/log";
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
    kind: "action",
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

  test("a target that closed in by 10 yd does not block engage", () => {
    const guard = guardAt({ t: 0 });
    const fight = (targetYd: number) =>
      call({
        args: { target: "u15" },
        scene: { combat: "", targetAttacking: false, targetYd },
        tool: "engage",
      });
    guard.record({
      ...fight(25),
      result: outcome("FAILED", "range:no_supported_combat_actions"),
    });
    expect(guard.check(fight(25 - REPEAT_MOVE_YD + 0.5))).toBeDefined();
    expect(guard.check(fight(15))).toBeUndefined();
    expect(guard.blocks(fight(15))).toBe(false);
  });

  test("a changed combat state clears the block", () => {
    const guard = guardAt({ t: 0 });
    const at = (combat: string) =>
      call({
        args: { target: "u15" },
        scene: { combat, targetAttacking: false, targetYd: 25 },
        tool: "engage",
      });
    guard.record({ ...at(""), result: outcome("FAILED", "no_ground") });
    expect(guard.check(at(""))).toBeDefined();
    expect(guard.check(at("f"))).toBeUndefined();
  });

  test("engage on a unit that attacks the character is never blocked", () => {
    const guard = guardAt({ t: 0 });
    const fight = call({
      args: { target: "u15" },
      scene: { combat: "f", targetAttacking: true, targetYd: 3.5 },
      tool: "engage",
    });
    guard.record({ ...fight, result: outcome("FAILED", "no_ground") });
    expect(guard.check(fight)).toBeUndefined();
    expect(guard.blocks(fight)).toBe(false);
  });

  test("remembers where a tool failed for a positional reason", () => {
    const now = { t: 0 };
    const guard = guardAt(now);
    const fight = call({ args: { target: "u43" }, tool: "engage" });
    expect(guard.positionalPoses("engage")).toEqual([]);
    guard.record({ ...fight, result: outcome("FAILED", "too_far") });
    expect(guard.positionalPoses("engage")).toEqual([]);
    guard.record({ ...fight, result: outcome("FAILED", "no_ground") });
    guard.record({
      ...call({ args: { to: "explore southeast" }, tool: "travel" }),
      result: outcome("DONE"),
    });
    guard.record({
      ...fight,
      pose: pose(5),
      result: outcome("FAILED", "no_ground"),
    });
    expect(guard.positionalPoses("engage")).toEqual([pose(0), pose(5)]);
    expect(guard.positionalPoses("travel")).toEqual([]);
    now.t = 300_001;
    expect(guard.positionalPoses("engage")).toEqual([]);
    guard.record({ ...fight, result: outcome("FAILED", "no_ground") });
    guard.record({ ...fight, result: outcome("DONE") });
    expect(guard.positionalPoses("engage")).toEqual([]);
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

  test("a DONE of an action or run clears every failure, a read or control does not", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    for (const [tool, kind] of [
      ["look", "read"],
      ["social", "read"],
      ["stop", "control"],
    ] as const)
      guard.record({
        ...call({ args: {}, kind, tool }),
        result: outcome("DONE"),
      });
    expect(guard.check(call())).toBeDefined();
    guard.record({
      ...call({ args: {}, kind: "run", tool: "journal" }),
      result: outcome("DONE"),
    });
    expect(guard.check(call())).toBeUndefined();
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    guard.record({
      ...call({ args: {}, kind: "action", tool: "look" }),
      result: outcome("DONE"),
    });
    expect(guard.check(call())).toBeUndefined();
  });

  test.each(["look", "journal", "social"] as const)(
    "an unanswered call is blocked until a read tool %s checks the result",
    (tool) => {
      const guard = guardAt({ t: 0 });
      const accept = call({ args: { do: "accept", npc: "u3", what: "1" } });
      guard.record({
        ...accept,
        result: outcome("UNCONFIRMED", "no_answer", 'journal(about: "quests")'),
      });
      guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
      expect(guard.check(accept)).toBeDefined();
      guard.record({
        ...call({ args: {}, kind: "control", tool: "stop" }),
        result: outcome("DONE"),
      });
      expect(guard.check(accept)).toBeDefined();
      guard.record({
        ...call({ args: {}, kind: "read", tool }),
        result: outcome("DONE"),
      });
      expect(guard.check(accept)).toBeUndefined();
      expect(guard.check(call())).toBeDefined();
    },
  );

  test("look is never blocked", () => {
    const guard = guardAt({ t: 0 });
    const look = call({ args: {}, kind: "read", tool: "look" });
    guard.record({ ...look, result: outcome("FAILED", "error") });
    expect(guard.check(look)).toBeUndefined();
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

function feed() {
  const rows: GameLogEntry[] = [];
  const arrive = (event: string) => {
    rows.push({ event, seq: rows.length + 1 } as GameLogEntry);
  };
  return {
    arrive,
    log: {
      lastSeq: () => rows.length,
      since: (seq: number) => rows.filter((row) => row.seq > seq),
    },
  };
}

describe("an offer after a missing-offer failure", () => {
  const cases = [
    {
      args: { do: "accept_invite" },
      event: "group/invite",
      reason: "nothing_to_accept",
      tool: "social",
    },
    {
      args: { do: "decline_invite" },
      event: "group/invite",
      reason: "nothing_to_decline",
      tool: "social",
    },
    {
      args: { accept: true, do: "answer" },
      event: "trade/requested",
      reason: "no_request",
      tool: "trade",
    },
    {
      args: { do: "bind" },
      event: "instances/bind_offer",
      reason: "no_bind_offer",
      tool: "dungeon",
    },
    {
      args: { accept: true, do: "answer" },
      event: "lfg/proposal",
      reason: "no_proposal",
      tool: "dungeon",
    },
    {
      args: { do: "roles", roles: 2 },
      event: "lfg/role_check",
      reason: "no_role_check",
      tool: "dungeon",
    },
    {
      args: { accept: true, do: "kick_vote" },
      event: "lfg/boot_vote",
      reason: "no_vote",
      tool: "dungeon",
    },
    {
      args: { do: "accept_quest" },
      event: "quests/offered",
      reason: "no_offer",
      tool: "group",
    },
    {
      args: { do: "roll", what: "greed" },
      event: "loot/roll",
      reason: "no_roll",
      tool: "group",
    },
    {
      args: { do: "ready", what: "yes" },
      event: "raid/ready_check",
      reason: "no_check",
      tool: "group",
    },
  ] as const;

  for (const one of cases) {
    const base = (log: ReturnType<typeof feed>["log"]) =>
      call({ args: one.args, log, tool: one.tool });

    test(`${one.event} lets ${one.tool} ${one.reason} run again`, () => {
      const f = feed();
      const guard = guardAt({ t: 0 });
      guard.record({ ...base(f.log), result: outcome("FAILED", one.reason) });
      expect(guard.check(base(f.log))).toMatchObject({ reason: one.reason });
      f.arrive(one.event);
      expect(guard.check(base(f.log))).toBeUndefined();
      expect(guard.blocks(base(f.log))).toBe(false);
    });

    test(`a repeat of ${one.tool} ${one.reason} with no new offer stays refused`, () => {
      const f = feed();
      f.arrive("chat/in");
      const guard = guardAt({ t: 0 });
      guard.record({ ...base(f.log), result: outcome("FAILED", one.reason) });
      f.arrive("chat/in");
      expect(guard.check(base(f.log))).toMatchObject({ reason: one.reason });
    });

    test(`an offer that came before the ${one.tool} failure does not clear it`, () => {
      const f = feed();
      f.arrive(one.event);
      const guard = guardAt({ t: 0 });
      guard.record({ ...base(f.log), result: outcome("FAILED", one.reason) });
      expect(guard.check(base(f.log))).toMatchObject({ reason: one.reason });
    });
  }

  test("a trade request does not clear a failure of another reason", () => {
    const f = feed();
    const trade = call({ args: { do: "give" }, log: f.log, tool: "trade" });
    const guard = guardAt({ t: 0 });
    guard.record({ ...trade, result: outcome("FAILED", "no_such_item") });
    f.arrive("trade/requested");
    expect(guard.check(trade)).toMatchObject({ reason: "no_such_item" });
  });

  test("an offer for another call does not clear this failure", () => {
    const f = feed();
    const accept = call({
      args: { do: "accept_invite" },
      log: f.log,
      tool: "social",
    });
    const guard = guardAt({ t: 0 });
    guard.record({ ...accept, result: outcome("FAILED", "nothing_to_accept") });
    f.arrive("trade/requested");
    expect(guard.check(accept)).toMatchObject({ reason: "nothing_to_accept" });
  });

  test("the retry that follows an offer and fails again is refused until the next offer", () => {
    const f = feed();
    const accept = call({
      args: { do: "accept_invite" },
      log: f.log,
      tool: "social",
    });
    const guard = guardAt({ t: 0 });
    guard.record({ ...accept, result: outcome("FAILED", "nothing_to_accept") });
    f.arrive("group/invite");
    expect(guard.check(accept)).toBeUndefined();
    guard.record({ ...accept, result: outcome("FAILED", "nothing_to_accept") });
    expect(guard.check(accept)).toMatchObject({ reason: "nothing_to_accept" });
    f.arrive("group/invite");
    expect(guard.check(accept)).toBeUndefined();
  });
});
