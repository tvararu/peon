import { expect, test } from "bun:test";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  fakeControl,
  fakeLoot,
  fakeTactics,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";
import { type PullVitals, pullGate } from "#wow/cycle-gate";
import { cycleStop } from "#wow/cycle-stop";

const MANA = 0;

function run(after: (vitals: PullVitals) => void) {
  const vitals: PullVitals = {
    attackers: [],
    self: {
      health: 200,
      maxHealth: 200,
      maxPower: 600,
      power: 600,
      powerType: MANA,
    },
  };
  const tactics = fakeTactics([]);
  const fought: bigint[] = [];
  const start = tactics.start;
  tactics.start = async (context, signal) => {
    fought.push(context.targetGuid);
    await start(context, signal);
    after(vitals);
  };
  const runtime = makeCycle({
    control: fakeControl(),
    gate: pullGate(() => vitals),
    loot: fakeLoot({ corpse: { dead: true, lootable: false } }),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  return { fought, runtime };
}

test("ends the run at low mana before the next pull", async () => {
  const { fought, runtime } = run((vitals) => {
    vitals.self.power = 145;
  });
  await runtime.start({ guids: [2n, 3n], instruction: "x" });
  expect(fought).toEqual([2n]);
  expect(runtime.snapshot()).toMatchObject({
    startsUsed: 1,
    stopCause: "low_mana",
    stopDetail: { pct: 24 },
  });
});

test("ends the run at low health before the next pull", async () => {
  const { fought, runtime } = run((vitals) => {
    vitals.self.health = 80;
  });
  await runtime.start({ guids: [2n, 3n], instruction: "x" });
  expect(fought).toEqual([2n]);
  expect(runtime.snapshot()).toMatchObject({ stopCause: "low_health" });
});

test("still fights a queued unit that is attacking you at low mana", async () => {
  const { fought, runtime } = run((vitals) => {
    vitals.self.power = 145;
    vitals.attackers = [3n];
  });
  await runtime.start({ guids: [2n, 3n], instruction: "x" });
  expect(fought).toEqual([2n, 3n]);
  expect(runtime.snapshot().stopCause).toBe("queue_exhausted");
});

test("a quest run stopped at low mana picks the same creature again on resume", async () => {
  const vitals: PullVitals = {
    attackers: [],
    self: {
      health: 200,
      maxHealth: 200,
      maxPower: 600,
      power: 145,
      powerType: MANA,
    },
  };
  const tactics = fakeTactics([]);
  const fought: bigint[] = [];
  const start = tactics.start;
  tactics.start = async (context, signal) => {
    fought.push(context.targetGuid);
    await start(context, signal);
  };
  const runtime = makeCycle({
    control: fakeControl(),
    gate: pullGate(() => vitals),
    loot: fakeLoot({ corpse: { dead: true, lootable: false } }),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  let kills = 0;
  const offered: bigint[][] = [];
  const progress = () => ({
    complete: kills > 0,
    items: [],
    kills: [{ current: kills, entry: 15_274, index: 0, required: 1 }],
    questId: 8325,
    slot: 0,
  });
  const objective = {
    pick: (tried: ReadonlySet<bigint>) => {
      offered.push([...tried]);
      if (kills > 0) return { kind: "complete" as const, progress: progress() };
      if (tried.has(7n)) return cycleStop("objective_targets_absent");
      return { distance: 5, entry: 15_274, guid: 7n, kind: "target" as const };
    },
    progress,
  };
  await runtime.start({ guids: [], instruction: "x", objective });
  expect(runtime.snapshot().stopCause).toBe("low_mana");
  vitals.self.power = 600;
  tactics.start = async (context, signal) => {
    fought.push(context.targetGuid);
    kills += 1;
    await start(context, signal);
  };
  await runtime.resume({});
  expect(fought).toEqual([7n]);
  expect(runtime.snapshot().stopCause).toBe("objective_complete");
});
