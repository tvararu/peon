import { expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import { EncounterCycleRuntime } from "#harness/loops/encounter-cycle";
import { recoveryPort, rewardsPort } from "#harness/loops/ports";
import { engageSpec } from "#harness/tools/engage";
import { liveUnit } from "#test-support/encounter-cycle-fixtures";
import {
  field,
  STALKER,
  STALKER_2,
  stalker,
} from "#test-support/engage-fixtures";
import { attackBy, setUnits, toolCtx } from "#test-support/ops-fixtures";

test("a new hostile is not pulled while the unreachable one still attacks across cycle batches", async () => {
  const t = await field();
  setUnits(t.handle, [stalker(STALKER, 22)]);
  const started: bigint[] = [];
  const cycle = new EncounterCycleRuntime({
    attackers: () => t.handle.getCombatState().attackers,
    bags: {
      questItems: () => new Set<number>(),
      stackSize: async () => undefined,
    },
    control: {
      face: () => {},
      move: () => {},
      snapshot: () => t.handle.getControlState(),
    },
    entity: (guid) => liveUnit(guid),
    now: () => 0,
    observed: (guid) => liveUnit(guid)?.position,
    recovery: recoveryPort(t.handle),
    rewards: rewardsPort(t.handle),
    tactics: {
      snapshot: () => ({
        lastOutcome: {
          reason: "target_unreachable",
          status: "blocked" as const,
        },
      }),
      start: async (context) => {
        started.push(context.targetGuid);
        if (started.length > 1) return;
        attackBy(t.handle, STALKER);
        setUnits(t.handle, [stalker(STALKER, 22), stalker(STALKER_2, 28)]);
      },
      stop: () => {},
    },
  });
  cycle.onEvent((event) => t.handle.triggerCycleEvent(event));
  t.handle.getCycleState = () => cycle.snapshot();
  t.handle.startCycle = (guids, instruction, maxStarts) =>
    cycle.start({ guids, instruction, maxStarts });
  await engageSpec.run(
    { count: 2, target: "Springpaw Stalker" },
    toolCtx<EngageAfter>(t),
  );
  expect(started).toEqual([STALKER]);
});
