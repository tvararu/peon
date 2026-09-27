import { expect, jest, test } from "bun:test";
import { must } from "@peon/core/test-support/must";
import {
  ARCANE_SHOT,
  AUTO_SHOT,
  CONCUSSIVE_SHOT,
  RAPTOR_STRIKE,
  SERPENT_STING,
  spell,
} from "@peon/core/test-support/spell-fixtures";
import { context, setup } from "#test-support/combat-actions-fixtures";
import { bowAndArrows, hunter } from "#test-support/hunter-fixtures";

const SHOTS = [AUTO_SHOT, ARCANE_SHOT, CONCUSSIVE_SHOT, SERPENT_STING].map(
  (id) => `spell:${id}:target`,
);

test("a hunter with a bow and arrows gets Auto Shot and the shot spells", () => {
  const { ids, unavailable } = hunter(20);
  for (const id of SHOTS) expect(ids()).toContain(id);
  expect(unavailable()).toEqual([
    {
      id: `spell:${RAPTOR_STRIKE}:target`,
      reason: "unsupported_item_requirement",
    },
  ]);
});

test("ranged shots have a melee dead zone and a 35 yd limit", () => {
  const near = hunter(3);
  expect(near.ids()).toContain("attack");
  for (const id of SHOTS) expect(near.ids()).not.toContain(id);
  expect(near.unavailable()).toContainEqual({
    id: `spell:${ARCANE_SHOT}:target`,
    reason: "too_close",
  });
  const far = hunter(40);
  expect(far.unavailable()).toContainEqual({
    id: `spell:${ARCANE_SHOT}:target`,
    reason: "out_of_range",
  });
  expect(far.actions.observe(context).outcome).toBeUndefined();
});

test("shots need an equipped ranged weapon and matching ammo in the bags", () => {
  const cases = [
    [{ ...bowAndArrows(), ammo: null }, "no_ammo"],
    [bowAndArrows(0), "no_ammo"],
    [{ ...bowAndArrows(), weapon: null }, "no_ranged_weapon"],
    [
      { ...bowAndArrows(), weapon: { entry: 1, itemClass: 2, subclass: 19 } },
      "wrong_ranged_weapon",
    ],
    [
      {
        ...bowAndArrows(),
        ammo: { count: 200, entry: 2516, itemClass: 6, subclass: 3 },
      },
      "wrong_ammo",
    ],
    [{ ammo: undefined, weapon: undefined }, "unobserved_ranged_weapon"],
  ] as const;
  for (const [gear, reason] of cases) {
    const { ids, unavailable } = hunter(20, () => gear);
    for (const id of SHOTS) {
      expect(ids()).not.toContain(id);
      expect(unavailable()).toContainEqual({ id, reason });
    }
  }
});

test("shots describe themselves as instant, not with the DBC sentinel", () => {
  const { actions } = hunter(20);
  const arcane = actions
    .observe(context)
    .candidates.find((candidate) => candidate.id === SHOTS[1]);
  expect(arcane?.description).toContain("cast 0ms");
  expect(arcane?.description).not.toContain("-1000000");
});

test("Auto Shot starts once, stays on beside other shots, and can be stopped", () => {
  const { actions, combat, combatStore, control, ids } = hunter(20);
  control.move("forward", 1000);
  actions.execute(`spell:${AUTO_SHOT}:target`, context);
  expect(control.snapshot().moving).toBe(false);
  expect(combat.snapshot().autoRepeat).toMatchObject({
    spellId: AUTO_SHOT,
    status: "pending",
    target: context.targetGuid,
  });
  combatStore.applySpellStart({
    castCount: 1,
    castItem: 1n,
    caster: 1n,
    flags: 0x20,
    spellId: AUTO_SHOT,
    targets: { flags: 2, objectGuid: 2n },
    timer: 0,
  });
  expect(ids()).not.toContain(`spell:${AUTO_SHOT}:target`);
  expect(ids()).toContain("stop_auto_shot");
  expect(ids()).toContain(`spell:${ARCANE_SHOT}:target`);
  expect(actions.observe(context).observation["autoRepeat"]).toMatchObject({
    shots: 0,
    spellId: AUTO_SHOT,
    status: "active",
    target: "0x2",
  });
  actions.execute("stop_auto_shot", context);
  expect(combat.snapshot().autoRepeat).toBeUndefined();
  expect(ids()).toContain(`spell:${AUTO_SHOT}:target`);
});

test("a caster spell with a slow aura stays unsupported", () => {
  const { actions, combat } = setup();
  const frostbolt = spell();
  frostbolt.effects.push({
    ...must(frostbolt.effects[0]),
    applyAura: 33,
    effect: 6,
  });
  const definition = jest
    .spyOn(combat, "definition")
    .mockReturnValue(frostbolt);
  try {
    expect(actions.observe(context).observation["unavailable"]).toEqual([
      { id: "spell:17:target", reason: "unsupported_aura:33" },
    ]);
  } finally {
    definition.mockRestore();
  }
});
