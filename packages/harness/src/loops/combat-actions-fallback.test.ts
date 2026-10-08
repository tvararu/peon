import { expect, test } from "bun:test";
import { UNIT_FIELDS } from "@peon/core";
import { context, setup } from "#test-support/combat-actions-fixtures";

function warrior(targetX: number) {
  let now = 1000;
  const fixture = setup(() => now);
  fixture.fields.set(UNIT_FIELDS.POWER1.offset, 0);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  fixture.motion.observe(2n, {
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

test("the fallback starts the swing when it is offered", () => {
  const { actions, standAt } = warrior(20);
  standAt(17);
  const frame = actions.observe(context);
  expect(frame.candidates.map((candidate) => candidate.id)).toContain("attack");
  expect(actions.fallback(frame, context)).toBe("attack");
});

test("the fallback faces an unfaced target before closing in", () => {
  const { actions } = warrior(-1);
  const frame = actions.observe(context);
  expect(frame.candidates.map((candidate) => candidate.id)).toContain(
    "face_target",
  );
  expect(actions.fallback(frame, context)).toBe("face_target");
});

test("the fallback closes in from out of melee range", () => {
  const { actions } = warrior(20);
  const frame = actions.observe(context);
  expect(frame.candidates.map((candidate) => candidate.id)).not.toContain(
    "attack",
  );
  expect(actions.fallback(frame, context)).toBe("move_forward");
});

test("the fallback never runs past a target it is already swinging at", () => {
  const { actions, standAt } = warrior(20);
  standAt(17);
  actions.execute("attack", context);
  const frame = actions.observe(context);
  expect(frame.candidates.map((candidate) => candidate.id)).toContain(
    "move_forward",
  );
  expect(actions.fallback(frame, context)).toBe("wait");
});

test("the fallback stops instead of running past while moving in melee", () => {
  const { actions, standAt } = warrior(20);
  standAt(17);
  actions.execute("attack", context);
  actions.execute("move_forward", context);
  const frame = actions.observe(context);
  expect(actions.fallback(frame, context)).toBe("stop_moving");
});
