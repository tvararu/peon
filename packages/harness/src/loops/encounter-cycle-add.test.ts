import { expect, test } from "bun:test";
import { type PullVitals, pullGate } from "#harness/loops/cycle-gate";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  fakeControl,
  fakeLoot,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";

const LYNX_U59 = 59n;
const LYNX_U58 = 58n;
const LYNX_U61 = 61n;

function joiningTactics(starts: bigint[], attackers: bigint[]) {
  return {
    start: async (
      ctx: { targetGuid: bigint; instruction: string },
      _signal?: AbortSignal,
    ) => {
      starts.push(ctx.targetGuid);
      const at = attackers.indexOf(ctx.targetGuid);
      if (at >= 0) attackers.splice(at, 1);
      if (ctx.targetGuid === LYNX_U59) attackers.push(LYNX_U58);
    },
    stop: (_reason: string) => {},
    snapshot: () => ({
      lastOutcome: {
        status: "completed" as const,
        reason: "server_kill_credit",
      },
    }),
  };
}

function vitals(attackers: bigint[], health: number): PullVitals {
  return {
    attackers,
    self: {
      health,
      maxHealth: 337,
      maxPower: 0,
      power: 0,
      powerType: 1,
    },
  };
}

test("fights an add that joined before pulling the next queued target", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: joiningTactics(starts, attackers),
  });
  await runtime.start({
    guids: [LYNX_U59, LYNX_U61],
    instruction: "fight",
    maxStarts: 2,
  });
  expect(starts).toEqual([LYNX_U59, LYNX_U58]);
  expect(runtime.snapshot().stopCause).toBe("max_starts_reached");
});

test("fights the attacker at low health, then stops instead of pulling", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  let health = 337;
  const tactics = joiningTactics(starts, attackers);
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    gate: pullGate(() => vitals(attackers, health)),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: {
      ...tactics,
      start: async (ctx, signal) => {
        await tactics.start(ctx, signal);
        health = 78;
      },
    },
  });
  await runtime.start({
    guids: [LYNX_U59, LYNX_U61],
    instruction: "fight",
    maxStarts: 3,
  });
  const state = runtime.snapshot();
  expect(starts).toEqual([LYNX_U59, LYNX_U58]);
  expect(state.stopCause).toBe("low_health");
});

test("re-engages a line-of-sight skipped unit that came to attack", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: {
      start: async (ctx) => {
        starts.push(ctx.targetGuid);
        attackers.length = 0;
        if (starts.length === 1) attackers.push(ctx.targetGuid);
      },
      stop: () => {},
      snapshot: () => ({
        lastOutcome:
          starts.length === 1
            ? {
                status: "blocked" as const,
                reason: "server_action_rejected:line_of_sight",
              }
            : { status: "completed" as const, reason: "server_kill_credit" },
      }),
    },
  });
  await runtime.start({
    guids: [LYNX_U59, LYNX_U61],
    instruction: "fight",
    maxStarts: 3,
  });
  expect(starts).toEqual([LYNX_U59, LYNX_U59, LYNX_U61]);
});

test("stops on an attacker whose retries are spent instead of pulling", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: {
      start: async (ctx) => {
        starts.push(ctx.targetGuid);
        attackers.length = 0;
        attackers.push(LYNX_U58);
      },
      stop: () => {},
      snapshot: () => ({
        lastOutcome: {
          status: "blocked" as const,
          reason: "server_action_rejected:line_of_sight",
        },
      }),
    },
  });
  await runtime.start({
    guids: [LYNX_U58, LYNX_U61],
    instruction: "fight",
    maxStarts: 5,
  });
  expect(starts).toEqual([LYNX_U58, LYNX_U58]);
  expect(runtime.snapshot().stopCause).toBe("attacker_unreachable");
});
