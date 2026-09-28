import { expect, jest, test } from "bun:test";
import { spell } from "@peon/core/test-support/spell-fixtures";
import { MAX_CONSECUTIVE_REJECTIONS } from "#harness/loops/combat-rejections";
import { context, setup } from "#test-support/combat-actions-fixtures";

function fight() {
  let now = 1000;
  const f = setup(() => now);
  jest.spyOn(f.combat, "definition").mockReturnValue(spell());
  return {
    ...f,
    later() {
      now += 100;
    },
    rejectCast(result: number) {
      now += 100;
      f.combat.cast(17, 2n);
      const count = f.combat.snapshot().pendingCast?.count ?? 0;
      now += 100;
      f.combatStore.applyCastFailed({
        castCount: count,
        spellId: 17,
        result,
        extra: [],
      });
    },
    interrupt() {
      now += 100;
      f.combat.cast(17, 2n);
      const count = f.combat.snapshot().pendingCast?.count ?? 0;
      now += 100;
      f.combatStore.applySpellFailure({
        caster: 1n,
        extraCasts: count,
        spellId: 17,
        result: 2,
      });
    },
    kill() {
      now += 100;
      f.combatStore.applyXp({
        victim: 2n,
        total: 60,
        kind: "kill",
        recruitAFriend: false,
      });
    },
  };
}

test("a facing rejection is observed and offers a re-face, and the fight goes on to the kill", () => {
  const f = fight();
  f.rejectCast(134);
  const frame = f.actions.observe(context);
  expect(frame.outcome).toBeUndefined();
  expect(frame.observation["rejections"]).toEqual({
    consecutive: 1,
    limit: MAX_CONSECUTIVE_REJECTIONS,
    last: { reason: "unit_not_infront", recoverable: true, facing: true },
  });
  expect(frame.candidates.map((candidate) => candidate.id)).toContain(
    "face_target",
  );
  f.kill();
  expect(f.actions.observe(context).outcome).toEqual({
    status: "completed",
    reason: "server_kill_credit",
  });
});

test("recoverable rejections stop the fight only when they come three in a row", () => {
  const f = fight();
  for (let i = 1; i < MAX_CONSECUTIVE_REJECTIONS; i++) {
    f.later();
    f.combatStore.applyAttackError("bad_facing");
    expect(f.actions.observe(context).outcome).toBeUndefined();
  }
  f.later();
  f.combatStore.applyAttackStart({ attacker: 1n, victim: 2n });
  expect(f.actions.observe(context).observation["rejections"]).toMatchObject({
    consecutive: 0,
  });
  for (let i = 0; i < MAX_CONSECUTIVE_REJECTIONS; i++) {
    f.later();
    f.combatStore.applyAttackError("bad_facing");
    f.actions.observe(context);
  }
  expect(f.actions.observe(context).outcome).toEqual({
    status: "blocked",
    reason: "server_action_rejected:bad_facing",
  });
});

test("out of range and interrupts are recoverable, a bad target stops at once", () => {
  const f = fight();
  f.rejectCast(97);
  expect(f.actions.observe(context).outcome).toBeUndefined();
  f.interrupt();
  expect(f.actions.observe(context)).toMatchObject({
    outcome: undefined,
    observation: {
      rejections: {
        consecutive: 2,
        last: { reason: "already_at_full_health", recoverable: true },
      },
    },
  });
  f.rejectCast(12);
  expect(f.actions.observe(context).outcome).toEqual({
    status: "blocked",
    reason: "server_action_rejected:bad_targets",
  });
});

test("a channelling refusal waits and never counts as a rejection", () => {
  const f = fight();
  f.combatStore.casts.beginChannel({
    durationMs: 3000,
    spellId: 17,
    target: 2n,
  });
  expect(() => f.combat.cast(17, 2n)).toThrow("channelling");
  const frame = f.actions.observe(context);
  expect(frame.outcome).toBeUndefined();
  expect(frame.candidates.map((candidate) => candidate.id)).toEqual(["wait"]);
  expect(frame.observation["rejections"]).toMatchObject({ consecutive: 0 });
});
