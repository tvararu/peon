import { expect, test } from "bun:test";
import { UNIT_FIELDS, type UnitEntity, UnitFlag } from "@peon/core";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  body,
  fakeControl,
  fakeLoot,
  fakeTactics,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";

const OTHER_PLAYER = 0x2an;

function unit(guid: bigint, change: Partial<UnitEntity> = {}): UnitEntity {
  const { entity } = body(guid, 10) as { entity: UnitEntity };
  return { ...entity, ...change };
}

function tapped(guid: bigint): UnitEntity {
  const flags = new Map(unit(guid).rawFields);
  flags.set(UNIT_FIELDS.DYNAMIC_FLAGS.offset, 0x4);
  return unit(guid, { rawFields: flags });
}

function run(units: UnitEntity[], guids: bigint[], maxStarts?: number) {
  const tactics = fakeTactics([]);
  const fought: bigint[] = [];
  const start = tactics.start;
  tactics.start = (context, signal) => {
    fought.push(context.targetGuid);
    return start(context, signal);
  };
  const byGuid = new Map(units.map((entity) => [entity.guid, entity]));
  const runtime = makeCycle({
    tactics,
    loot: fakeLoot({ corpse: { dead: true, lootable: false } }),
    recovery: fakeRecovery({ life: ["alive"] }),
    control: fakeControl(),
    entity: (guid) => byGuid.get(guid),
    now: () => 0,
  });
  return {
    fought,
    runtime,
    start: runtime.start({ guids, instruction: "x", maxStarts }),
  };
}

test("a queued unit that died before its turn is skipped without a fight", async () => {
  const { fought, runtime, start } = run(
    [unit(2n, { health: 0 }), unit(3n)],
    [2n, 3n],
  );
  await start;
  expect(fought).toEqual([3n]);
  expect(runtime.snapshot()).toMatchObject({
    startsUsed: 1,
    stopCause: "queue_exhausted",
    queue: [
      { guid: 2n, status: "skipped", cause: "target_dead" },
      { guid: 3n, status: "done" },
    ],
  });
});

test("a queued unit tapped by another player is skipped", async () => {
  const { fought, runtime, start } = run([tapped(2n), unit(3n)], [2n, 3n]);
  await start;
  expect(fought).toEqual([3n]);
  expect(runtime.snapshot().queue[0]).toMatchObject({
    status: "skipped",
    cause: "tapped_by_other",
  });
});

test("a queued unit fighting another player is skipped", async () => {
  const busy = unit(2n, {
    target: OTHER_PLAYER,
    unitFlags: UnitFlag.IN_COMBAT,
  });
  const { fought, runtime, start } = run([busy, unit(3n)], [2n, 3n]);
  await start;
  expect(fought).toEqual([3n]);
  expect(runtime.snapshot().queue[0]).toMatchObject({
    status: "skipped",
    cause: "engaged_by_other",
  });
});

test("a unit fighting this character is still fought", async () => {
  const mine = unit(2n, { target: 1n, unitFlags: UnitFlag.IN_COMBAT });
  const { fought, start } = run([mine], [2n]);
  await start;
  expect(fought).toEqual([2n]);
});

test("skipped units do not use up the fight budget", async () => {
  const { fought, runtime, start } = run(
    [unit(2n, { health: 0 }), tapped(3n), unit(4n)],
    [2n, 3n, 4n],
    1,
  );
  await start;
  expect(fought).toEqual([4n]);
  expect(runtime.snapshot()).toMatchObject({
    startsUsed: 1,
    stopCause: "queue_exhausted",
  });
});

test("a fight refused because the target is already dead is not counted", async () => {
  const tactics = fakeTactics([new Error("target_dead")]);
  const runtime = makeCycle({
    tactics,
    loot: fakeLoot({ corpse: { dead: true, lootable: false } }),
    recovery: fakeRecovery({ life: ["alive"] }),
    control: fakeControl(),
    now: () => 0,
  });
  await runtime.start({ guids: [2n, 3n], instruction: "x" });
  expect(runtime.snapshot()).toMatchObject({
    startsUsed: 1,
    queue: [{ status: "skipped", cause: "target_dead" }, { status: "done" }],
  });
});

test("a queued unit that left view is skipped before any fight starts", async () => {
  const { fought, runtime, start } = run([unit(3n)], [2n, 3n], 2);
  await start;
  expect(fought).toEqual([3n]);
  expect(runtime.snapshot()).toMatchObject({
    startsUsed: 1,
    queue: [
      { guid: 2n, status: "skipped", cause: "target_unobserved" },
      { guid: 3n, status: "done" },
    ],
  });
});
