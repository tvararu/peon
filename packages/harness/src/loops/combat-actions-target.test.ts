import { expect, test } from "bun:test";
import {
  type CombatState,
  type FactionRelation,
  ObjectType,
  UnitFlag,
} from "@peon/core";
import { EntityStore } from "@peon/core/test-support/internals";
import { targetReason } from "#harness/loops/combat-actions-target";

const SELF = 1n;

const state = {
  self: { guid: SELF, health: 100 },
  target: { health: 100 },
} as unknown as CombatState;

function world(
  relation: FactionRelation,
  options: { objectType?: ObjectType; attacking?: boolean } = {},
) {
  const store = new EntityStore();
  store.create(SELF, ObjectType.PLAYER, { health: 100, maxHealth: 100 });
  store.create(2n, options.objectType ?? ObjectType.UNIT, {
    health: 100,
    maxHealth: 100,
    target: options.attacking ? SELF : 0n,
    unitFlags: options.attacking ? UnitFlag.IN_COMBAT : 0,
  });
  return {
    combat: { isAttackingSelf: () => false },
    entity: (guid: bigint) => store.get(guid),
    relation: () => relation,
  };
}

test("engages hostile and neutral creatures", () => {
  expect(targetReason(world("hostile"), 2n, state)).toBeUndefined();
  expect(targetReason(world("neutral"), 2n, state)).toBeUndefined();
});

test("refuses friendly creatures and players with distinct reasons", () => {
  expect(targetReason(world("friendly"), 2n, state)).toBe("target_friendly");
  expect(
    targetReason(
      world("hostile", { objectType: ObjectType.PLAYER }),
      2n,
      state,
    ),
  ).toBe("target_not_pve_creature");
});

test("reports a target that is not in view as unobserved", () => {
  expect(targetReason(world("hostile"), 3n, state)).toBe("target_unobserved");
});

test("refuses an unknown relation unless the creature attacks the character", () => {
  expect(targetReason(world("unknown"), 2n, state)).toBe(
    "unverified_hostile_relation",
  );
  expect(
    targetReason(world("unknown", { attacking: true }), 2n, state),
  ).toBeUndefined();
  expect(
    targetReason(world("friendly", { attacking: true }), 2n, state),
  ).toBeUndefined();
});
