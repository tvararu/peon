import { expect, jest, test } from "bun:test";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  advanceUntilSettled,
  body,
  fakeControl,
  fakeLoot,
  fakeTactics,
  lootableCorpse,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";
import type { ControlPose } from "#wow/control";
import type { UnitEntity } from "#wow/entity-store";
import { distance } from "#wow/geometry";
import { UNIT_FIELDS } from "#wow/protocol/entity-fields";

const START: ControlPose = {
  mapId: 0,
  x: 0,
  y: 0,
  z: 0,
  orientation: Math.PI,
  source: "predicted",
  updatedAt: 0,
};

function corpseAt(x: number, lootable = true) {
  let { entity } = body(2n, 10, { x, y: 0, z: 0 }) as { entity: UnitEntity };
  const tactics = fakeTactics([]);
  const start = tactics.start;
  tactics.start = (context, signal) => {
    const corpse = lootableCorpse(entity);
    const rawFields = new Map(corpse.rawFields);
    if (!lootable) rawFields.delete(UNIT_FIELDS.DYNAMIC_FLAGS.offset);
    entity = { ...corpse, rawFields };
    return start(context, signal);
  };
  return {
    entity: (guid: bigint) => (guid === 2n ? entity : undefined),
    tactics,
  };
}

function tracked(corpseX: number, lootable = true) {
  const order: string[] = [];
  const control = fakeControl({ pose: START });
  const move = control.move.bind(control);
  control.move = (direction, durationMs) => {
    order.push("move");
    move(direction, durationMs);
  };
  const loot = fakeLoot({ items: [4], corpse: { dead: true, lootable } });
  const open = loot.open.bind(loot);
  loot.open = (guid) => {
    order.push("open");
    return open(guid);
  };
  const runtime = makeCycle({
    ...corpseAt(corpseX, lootable),
    loot,
    recovery: fakeRecovery({ life: ["alive"] }),
    control,
    now: () => 0,
  });
  return { control, loot, order, runtime };
}

test("a corpse at 8.8 yd is approached before the loot open", async () => {
  jest.useFakeTimers();
  try {
    const { control, loot, order, runtime } = tracked(8.8);
    const running = runtime.start({ guids: [2n], instruction: "fight" });
    await advanceUntilSettled(running, 10_000);
    expect(order[0]).toBe("move");
    expect(order.at(-1)).toBe("open");
    const pose = control.pose();
    if (!pose) throw new Error("no pose");
    expect(distance(pose, { x: 8.8, y: 0, z: 0 })).toBeLessThanOrEqual(5);
    expect(loot.taken()).toEqual([4]);
    expect(runtime.snapshot().stopCause).toBe("queue_exhausted");
  } finally {
    jest.useRealTimers();
  }
});

test("a corpse already within reach is opened without moving", async () => {
  const { order, runtime } = tracked(3);
  await runtime.start({ guids: [2n], instruction: "fight" });
  expect(order).toEqual(["open"]);
  expect(runtime.snapshot().queue[0]?.loot).toBe("looted");
});

test("a far corpse with no loot is not walked to", async () => {
  jest.useFakeTimers();
  try {
    const { loot, order, runtime } = tracked(8.8, false);
    const running = runtime.start({ guids: [2n], instruction: "fight" });
    await advanceUntilSettled(running, 10_000);
    expect(order).toEqual(["open"]);
    expect(loot.taken()).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
});

test("an unanswered open is abandoned and the next corpse still loots", async () => {
  jest.useFakeTimers();
  try {
    const loot = fakeLoot({ items: [4], silentOpens: 1 });
    const runtime = makeCycle({
      tactics: fakeTactics([]),
      loot,
      recovery: fakeRecovery({ life: ["alive"] }),
      control: fakeControl(),
      now: () => 0,
    });
    const running = runtime.start({ guids: [2n, 3n], instruction: "fight" });
    await advanceUntilSettled(running, 12_000);
    expect(loot.taken()).toEqual([4]);
    expect(runtime.snapshot()).toMatchObject({
      stopCause: "queue_exhausted",
      queue: [
        { status: "done", loot: "none", cause: "loot_denied:timeout" },
        { status: "done", loot: "looted" },
      ],
    });
  } finally {
    jest.useRealTimers();
  }
});
