import { expect, test } from "bun:test";
import {
  context,
  MOVE_IDS,
  setup,
} from "#test-support/combat-actions-fixtures";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

function warrior(targetX: number) {
  let now = 1000;
  const fixture = setup(() => now);
  fixture.fields.set(UNIT_FIELDS.POWER1.offset, 0);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  fixture.combat.observePosition(2n, {
    mapId: 530,
    orientation: 0,
    x: targetX,
    y: 0,
    z: 0,
  });
  const standAt = (x: number) =>
    fixture.control.observeSelf({
      position: { mapId: 530, orientation: 0, x, y: 0, z: 0 },
      runBackSpeed: 4,
      runSpeed: 7,
    });
  const advance = (ms: number) => {
    now += ms;
  };
  return { ...fixture, advance, standAt };
}

test("a melee class with no usable spell approaches, then swings", () => {
  const { actions, combat, control, standAt } = warrior(20);
  const far = actions.observe(context);
  expect(far.outcome).toBeUndefined();
  expect(far.candidates.map((candidate) => candidate.id)).toEqual([
    "wait",
    ...MOVE_IDS,
  ]);
  actions.execute("move_forward", context);
  control.halt();
  standAt(17);
  const near = actions.observe(context);
  expect(near.outcome).toBeUndefined();
  expect(near.candidates.map((candidate) => candidate.id)).toContain("attack");
  actions.execute("attack", context);
  expect(combat.snapshot().pendingAttack).toBe(2n);
});

test("a melee class that stops closing in is unreachable, not blocked", () => {
  const { actions, advance } = warrior(20);
  expect(actions.observe(context).outcome).toBeUndefined();
  advance(2000);
  expect(actions.observe(context).outcome).toBeUndefined();
  advance(5000);
  expect(actions.observe(context).outcome).toEqual({
    status: "blocked",
    reason: "target_unreachable",
  });
});
