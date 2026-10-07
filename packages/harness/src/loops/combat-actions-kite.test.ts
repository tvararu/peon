import { expect, test } from "bun:test";
import type { CombatAura } from "@peon/core";
import { spell } from "@peon/core/test-support/spell-fixtures";
import {
  meleeReachOf,
  snares,
  targetGap,
} from "#harness/loops/combat-actions-moves";
import { context, setup } from "#test-support/combat-actions-fixtures";
import { unitRow } from "#test-support/ops-fixtures";

function aura(spellId: number, name?: string): CombatAura {
  return {
    caster: 1n,
    duration: undefined,
    flags: 0,
    level: 1,
    slot: spellId,
    spellId,
    stacks: 1,
    timeLeft: undefined,
    ...(name && { name }),
  };
}

function withAura(applyAura: number) {
  const definition = spell();
  const [effect] = definition.effects;
  if (effect) effect.applyAura = applyAura;
  return definition;
}

test("target auras are classified as root, slow or neither by their aura effect", () => {
  const { combat } = setup();
  const state = {
    ...combat.snapshot(2n),
    targetAuras: [
      aura(1, "Frost Nova"),
      aura(2, "Frostbolt"),
      aura(3, "Fortitude"),
      aura(4),
    ],
  };
  const applied: Record<number, number> = { 1: 26, 2: 33, 3: 79, 4: 33 };
  const found = snares(state, (id) => withAura(applied[id] ?? 0));
  expect(found).toEqual([
    { kind: "root", name: "Frost Nova" },
    { kind: "slow", name: "Frostbolt" },
    { kind: "slow", name: "spell 4" },
  ]);
  expect(snares(state, () => undefined)).toEqual([]);
});

test("melee reach uses both combat reaches and falls back to 5 when unobserved", () => {
  const { combat, store } = setup();
  const state = combat.snapshot(2n);
  const lookup = (guid: bigint) => store.get(guid);
  expect(meleeReachOf(state, lookup)).toBe(5);
  expect(targetGap(state, lookup)).toBe(5);
  store.update(1n, { combatReach: 3 });
  store.update(2n, { combatReach: 3 });
  expect(meleeReachOf(state, lookup)).toBeCloseTo(7.333, 3);
  expect(targetGap(state, lookup)).toBeCloseTo(2.7, 1);
});

test("danger is reported per offered move, not only toward the target", () => {
  const rows = [
    {
      ...unitRow({
        distance: 0,
        guid: 1n,
        level: 10,
        name: "Self",
        x: 0,
        y: 0,
      }),
      self: true,
    },
    unitRow({
      distance: 28,
      guid: 5n,
      level: 8,
      name: "Sleeper",
      x: 0,
      y: -28,
    }),
  ];
  const { actions } = setup(undefined, { nearby: () => rows });
  const text = String(actions.observe(context).observation["danger"]);
  expect(text).toContain("strafe_right enters Sleeper's range");
  expect(text).not.toContain("run_ahead enters");
});
