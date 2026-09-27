import { expect, test } from "bun:test";
import type { UnitEntity } from "@peon/core";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  body,
  fakeControl,
  fakeLoot,
  liveUnit,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";

function recordingTactics(log: string[]) {
  return {
    snapshot: () => ({
      lastOutcome: {
        reason: "server_kill_credit",
        status: "completed" as const,
      },
    }),
    start: async (ctx: { targetGuid: bigint; instruction: string }) => {
      log.push(`fight ${ctx.targetGuid}`);
    },
    stop: (_reason: string) => {},
  };
}

test("routes to each queued target before its fight starts", async () => {
  const log: string[] = [];
  const runtime = makeCycle({
    approach: async (guid) => {
      log.push(`route ${guid}`);
    },
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: recordingTactics(log),
  });
  await runtime.start({ guids: [1n, 2n], instruction: "fight", maxStarts: 5 });
  expect(log).toEqual(["route 1", "fight 1", "route 2", "fight 2"]);
});

test("skips a queued target without a route and keeps its start", async () => {
  const log: string[] = [];
  const runtime = makeCycle({
    approach: async (guid) => (guid === 2n ? "target_unreachable" : undefined),
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: recordingTactics(log),
  });
  await runtime.start({
    guids: [1n, 2n, 3n],
    instruction: "fight",
    maxStarts: 2,
  });
  const state = runtime.snapshot();
  expect(log).toEqual(["fight 1", "fight 3"]);
  expect(state.queue[1]).toMatchObject({
    cause: "target_unreachable",
    status: "skipped",
  });
  expect(state.startsUsed).toBe(2);
});

test("names the death of a target that died during the walk", async () => {
  const log: string[] = [];
  let corpse: UnitEntity | undefined = liveUnit(1n);
  const runtime = makeCycle({
    approach: async () => {
      corpse = (body(1n, 0) as { entity: UnitEntity }).entity;
      return "target_unreachable";
    },
    control: fakeControl(),
    entity: () => corpse,
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: recordingTactics(log),
  });
  await runtime.start({ guids: [1n], instruction: "fight", maxStarts: 2 });
  expect(log).toEqual([]);
  expect(runtime.snapshot().queue[0]).toMatchObject({
    cause: "target_dead",
    status: "skipped",
  });
});
