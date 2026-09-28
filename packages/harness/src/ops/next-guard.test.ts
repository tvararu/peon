import { describe, expect, test } from "bun:test";
import type { RepeatCall } from "#harness/contract/services";
import { guardCall, guardNext } from "#harness/ops/next-guard";
import { createRefTable } from "#harness/ops/refs";
import { createRepeatGuard, parseCall } from "#harness/ops/repeat-guard";
import { createSightings } from "#harness/ops/sightings";
import { poseView } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  nearbyRow,
  ORIGIN,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

const never = () => false;
const calm = () => ({
  attacker: undefined,
  bearing: undefined,
  failedElsewhere: false,
});

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
      scene: calm,
      tool: "engage",
    });
    expect(guarded).toBe(partly);
  });

  test("a repeat with no progress from the same place asks the human", () => {
    const guarded = guardNext(partly, {
      args: { count: 2, target: "Springpaw Stalker" },
      blocked: sameCall,
      progressed: false,
      scene: calm,
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
      scene: calm,
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
        scene: calm,
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
      scene: calm,
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
      scene: calm,
      tool: "engage",
    });
    expect(other.next).toBe(partly.next);
    const done = result("DONE", { after: {}, detail: "ok.", next: "look()" });
    expect(
      guardNext(done, {
        args: {},
        blocked: () => true,
        progressed: false,
        scene: calm,
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
        scene: calm,
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
        scene: calm,
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
        scene: calm,
        tool: "engage",
      }),
    ).toBe(capped);
  });

  test("under attack a blocked Next becomes engage on the attacker", () => {
    const refused = result("REFUSED", {
      after: {},
      detail: "Springpaw Stalker u15 is attacking you.",
      next: 'engage(target: "u15")',
      reason: "attacked",
    });
    const kept = guardNext(refused, {
      args: { to: "explore north" },
      blocked: () => true,
      progressed: false,
      scene: () => ({ ...calm(), attacker: "u15" }),
      tool: "travel",
    });
    expect(kept.next).toBe('engage(target: "u15")');
    const other = result("FAILED", {
      after: {},
      detail: "could not reach Ranger Degolien (u14).",
      next: 'travel(to: "u14")',
      reason: "no_ground",
    });
    expect(
      guardNext(other, {
        args: { npc: "u14" },
        blocked: () => true,
        progressed: false,
        scene: () => ({ ...calm(), attacker: "u15", bearing: "SE" }),
        tool: "interact",
      }).next,
    ).toBe('engage(target: "u15")');
  });

  test("under attack a repeat refusal engages the attacker, not the human", () => {
    const repeat = result("REFUSED", {
      after: {},
      detail: "you already tried this from here and it failed (no_ground).",
      next: 'ask the human: "My travel call keeps failing (no_ground). What should I do?"',
      reason: "repeat",
    });
    expect(
      guardNext(repeat, {
        args: { to: "u9" },
        blocked: never,
        progressed: false,
        scene: () => ({ ...calm(), attacker: "u15" }),
        tool: "travel",
      }).next,
    ).toBe('engage(target: "u15")');
    expect(
      guardNext(repeat, {
        args: { to: "u9" },
        blocked: never,
        progressed: false,
        scene: calm,
        tool: "travel",
      }),
    ).toBe(repeat);
  });

  test.each([
    "no_ground",
    "ambiguous_floor",
    "unreachable",
    "target_unreachable",
    "not_in_view",
    "obstructed",
  ])("a positional %s moves toward the target first", (reason) => {
    const failed = result("FAILED", {
      after: {},
      detail: "could not reach Springpaw Stalker (u43).",
      next: 'engage(target: "u43")',
      reason,
    });
    const init = {
      args: { target: "u43" },
      blocked: () => true,
      progressed: false,
      tool: "engage",
    } as const;
    expect(
      guardNext(failed, {
        ...init,
        scene: () => ({ ...calm(), bearing: "SE" }),
      }).next,
    ).toBe('travel(to: "explore southeast")');
    expect(
      guardNext(failed, {
        ...init,
        scene: () => ({ ...calm(), bearing: "SE", failedElsewhere: true }),
      }).next,
    ).toBe(
      `ask the human: "My engage call failed (${reason}) and repeating it will not help. What should I do?"`,
    );
  });
});

describe("guardCall", () => {
  async function field() {
    const clock = { now: () => 1000 };
    const repeats = createRepeatGuard(clock);
    const { handle, rt } = await createTestRuntime({
      parts: {
        clock,
        refs: createRefTable(),
        repeats,
        sightings: createSightings(clock),
      },
    });
    const lynx = nearbyRow(
      unitEntity({ dx: -20, dy: -20, guid: 0x43n, name: "Springpaw Lynx" }),
      { relation: "hostile" },
    );
    const at = (dx: number) =>
      setWorld(handle, {
        pose: selfPose(1000, { x: ORIGIN.x + dx }),
        rows: [selfRow(), lynx],
      });
    at(0);
    rt.refs.refOf(0x43n);
    const failed = result("FAILED", {
      after: {},
      detail: "could not reach Springpaw Lynx (u1).",
      next: 'engage(target: "u1")',
      reason: "no_ground",
    });
    const engage = (): RepeatCall => ({
      args: { target: "u1" },
      digest: "",
      kind: "run",
      pose: poseView({ handle, rt }),
      tool: "engage",
    });
    const guard = () =>
      guardCall(
        { args: { target: "u1" }, handle, rt, startedAt: 1000, tool: "engage" },
        failed,
      ).next;
    const fail = () => repeats.record({ ...engage(), result: failed });
    return { at, fail, guard, repeats };
  }

  test("a no_ground failure moves first, then asks only after a failure from a new pose", async () => {
    const { at, fail, guard, repeats } = await field();
    fail();
    expect(guard()).toBe('travel(to: "explore southeast")');
    fail();
    repeats.record({
      args: { to: "explore southeast" },
      digest: "",
      kind: "run",
      pose: undefined,
      result: result("DONE", { after: {}, detail: "walked." }),
      tool: "travel",
    });
    at(-5);
    expect(guard()).toBe('engage(target: "u1")');
    fail();
    expect(guard()).toBe(
      'ask the human: "My engage call failed (no_ground) and repeating it will not help. What should I do?"',
    );
  });
});
