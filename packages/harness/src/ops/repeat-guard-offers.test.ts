import { describe, expect, test } from "bun:test";
import type { GameLogEntry, LogClass } from "#harness/contract/log";
import type { ToolResult } from "#harness/contract/result";
import type { RepeatCall } from "#harness/contract/services";
import { createRepeatGuard } from "#harness/ops/repeat-guard";

function call(over: Partial<RepeatCall> = {}): RepeatCall {
  return {
    args: { npc: "u3" },
    digest: "d1",
    kind: "action",
    pose: undefined,
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

function feed() {
  const rows: GameLogEntry[] = [];
  const arrive = (
    event: string,
    kind: LogClass = "wake",
    data: Record<string, unknown> = {},
  ) => {
    rows.push({
      class: kind,
      data,
      event,
      seq: rows.length + 1,
    } as GameLogEntry);
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
      data: { deadline: 5, dungeon: 1, id: 7, state: 0 },
      event: "lfg/proposal",
      reason: "no_proposal",
      tool: "dungeon",
    },
    {
      args: { do: "roles", roles: 2 },
      data: { state: 1, stateName: "initializing" },
      event: "lfg/role_check",
      reason: "no_role_check",
      tool: "dungeon",
    },
    {
      args: { accept: true, do: "kick_vote" },
      data: { agrees: 0, inProgress: true, needed: 3, victim: "9", votes: 0 },
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
      f.arrive(one.event, "wake", "data" in one ? one.data : {});
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

  const prompts = [
    {
      args: { accept: true, do: "answer" },
      closed: [
        { dungeon: 1, id: 7, state: 0 },
        { dungeon: 1, id: 7, state: 1 },
        { dungeon: 1, id: 7, state: 2 },
      ],
      event: "lfg/proposal",
      opening: { deadline: 5, dungeon: 1, id: 7, state: 0 },
      reason: "no_proposal",
    },
    {
      args: { do: "roles", roles: 2 },
      closed: [
        { state: 3, stateName: "no_role" },
        { state: 4, stateName: "aborted" },
      ],
      event: "lfg/role_check",
      opening: { state: 1, stateName: "initializing" },
      reason: "no_role_check",
    },
    {
      args: { accept: true, do: "kick_vote" },
      closed: [
        { agrees: 2, inProgress: false, needed: 3, victim: "9", votes: 3 },
      ],
      event: "lfg/boot_vote",
      opening: {
        agrees: 0,
        inProgress: true,
        needed: 3,
        victim: "9",
        votes: 0,
      },
      reason: "no_vote",
    },
  ] as const;

  for (const one of prompts) {
    test(`a ${one.event} row that opens no prompt does not clear ${one.reason}`, () => {
      for (const kind of ["log", "passive", "wake"] as const) {
        for (const data of one.closed) {
          const f = feed();
          const dungeon = call({ args: one.args, log: f.log, tool: "dungeon" });
          const guard = guardAt({ t: 0 });
          guard.record({ ...dungeon, result: outcome("FAILED", one.reason) });
          f.arrive(one.event, kind, data);
          expect(guard.check(dungeon)).toMatchObject({ reason: one.reason });
          expect(guard.blocks(dungeon)).toBe(true);
        }
      }
    });

    test(`an opening ${one.event} row clears ${one.reason} in every delivery class`, () => {
      for (const kind of ["log", "passive", "wake"] as const) {
        const f = feed();
        const dungeon = call({ args: one.args, log: f.log, tool: "dungeon" });
        const guard = guardAt({ t: 0 });
        guard.record({ ...dungeon, result: outcome("FAILED", one.reason) });
        f.arrive(one.event, kind, one.opening);
        expect(guard.check(dungeon)).toBeUndefined();
      }
    });
  }
});
