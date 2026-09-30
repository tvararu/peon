import { describe, expect, jest, test } from "bun:test";
import { type PullVitals, pullGate } from "#harness/loops/cycle-gate";
import { cycleStop } from "#harness/loops/cycle-stop";
import type { CycleObjective } from "#harness/loops/encounter-cycle";
import { questCycleObjective } from "#harness/loops/quest-cycle";
import type { ObjectivePick } from "#harness/loops/quest-objective";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  advanceUntilSettled,
  fakeControl,
  fakeTactics,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";
import {
  CRATE_ENTRY,
  CRATE_GUID,
  QUEST,
  world,
} from "#test-support/quest-object-world";

const ATTACKER = 77n;
const SELF = {
  health: 200,
  maxHealth: 200,
  maxPower: 600,
  power: 600,
  powerType: 0,
};

function vitals(attackers: bigint[]): PullVitals {
  return { attackers, self: SELF };
}

function completeAfter(t: ReturnType<typeof world>, ms: number | undefined) {
  if (ms === undefined) return;
  t.loot.onEvent((event) => {
    if (event.type !== "loot_removed") return;
    setTimeout(() => {
      t.state.flags = 1;
      t.handle.triggerQuestEvent({
        source: "packet",
        state: t.handle.getQuestState(),
        type: "log",
      });
    }, ms);
  });
}

async function runObjective(
  t: ReturnType<typeof world>,
  objective: CycleObjective,
  attackers: bigint[],
  tactics = fakeTactics([]),
) {
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    gate: pullGate(() => vitals(attackers)),
    loot: t.loot,
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  await advanceUntilSettled(
    runtime.start({
      guids: [],
      instruction: "get the crates",
      maxStarts: 4,
      objective,
    }),
    30_000,
  );
  return { runtime, tactics };
}

describe("the object loop after the last loot", () => {
  test("waits for a complete flag that arrives after the loot", async () => {
    jest.useFakeTimers();
    try {
      const t = world();
      completeAfter(t, 1500);
      const { objective } = await questCycleObjective(t.handle, QUEST, []);
      const { runtime } = await runObjective(t, objective, []);
      expect(runtime.snapshot().stopCause).toBe("objective_complete");
    } finally {
      jest.useRealTimers();
    }
  });

  test("reports absent targets once the wait runs out", async () => {
    jest.useFakeTimers();
    try {
      const t = world();
      completeAfter(t, undefined);
      const { objective } = await questCycleObjective(t.handle, QUEST, []);
      const { runtime } = await runObjective(t, objective, []);
      expect(runtime.snapshot().stopCause).toBe("objective_targets_absent");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the object loop when an attacker interrupts it", () => {
  const objectPick: ObjectivePick = {
    distance: 5,
    entry: CRATE_ENTRY,
    guid: CRATE_GUID,
    kind: "object",
  };

  test("fights the attacker through the engage path, then resumes", async () => {
    const t = world();
    let visits = 0;
    const attackers: bigint[] = [];
    const fought: bigint[] = [];
    const objective: CycleObjective = {
      pick: () => objectPick,
      progress: () => undefined,
      visit: async () => {
        visits++;
        if (visits === 1) attackers.push(ATTACKER);
        return { cause: "fighting_back", ok: true };
      },
    };
    const tactics = fakeTactics([]);
    const start = tactics.start;
    tactics.start = async (ctx, signal) => {
      fought.push(ctx.targetGuid);
      attackers.length = 0;
      await start(ctx, signal);
    };
    const runtime = makeCycle({
      attackers: () => [...attackers],
      control: fakeControl(),
      gate: pullGate(() => vitals(attackers)),
      loot: t.loot,
      now: () => 0,
      recovery: fakeRecovery({ life: ["alive"] }),
      tactics,
    });
    await runtime.start({
      guids: [],
      instruction: "x",
      maxStarts: 4,
      objective,
    });
    expect(fought).toEqual([ATTACKER]);
    expect(visits).toBeGreaterThan(1);
  });

  test("does not fight the same attacker again after a failed fight", async () => {
    const t = world();
    const attackers: bigint[] = [ATTACKER];
    const fought: bigint[] = [];
    const objective: CycleObjective = {
      pick: () =>
        fought.length > 0 ? cycleStop("objective_targets_absent") : objectPick,
      progress: () => undefined,
      visit: async () => ({ cause: "fighting_back", ok: true }),
    };
    const tactics = fakeTactics([new Error("fight_failed")]);
    const start = tactics.start;
    tactics.start = async (ctx, signal) => {
      fought.push(ctx.targetGuid);
      await start(ctx, signal);
    };
    const runtime = makeCycle({
      attackers: () => [...attackers],
      control: fakeControl(),
      gate: pullGate(() => vitals(attackers)),
      loot: t.loot,
      now: () => 0,
      recovery: fakeRecovery({ life: ["alive"] }),
      tactics,
    });
    await runtime.start({
      guids: [],
      instruction: "x",
      maxStarts: 4,
      objective,
    });
    expect(fought).toEqual([ATTACKER]);
  });
});
