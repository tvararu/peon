import { jest } from "bun:test";
import { UNIT_FIELDS } from "@peon/core";
import {
  HUNTER_SPELLS,
  hunterSpells,
} from "@peon/core/test-support/spell-fixtures";
import type { RangedGear } from "#harness/loops/combat-ranged-gear";
import { context, setup } from "#test-support/combat-actions-fixtures";

export function bowAndArrows(count = 1000): RangedGear {
  return {
    ammo: { count, entry: 2515, itemClass: 6, subclass: 2 },
    weapon: { entry: 2504, itemClass: 2, subclass: 2 },
  };
}

export function hunter(
  targetX: number,
  gear: () => RangedGear = () => bowAndArrows(),
) {
  let now = 1000;
  const fixture = setup(() => now, { gear });
  const defs = hunterSpells();
  jest
    .spyOn(fixture.combatStore, "definition")
    .mockImplementation((id) => defs[id]);
  fixture.combatStore.applyInitialSpells({
    cooldowns: [],
    spells: HUNTER_SPELLS.map((spellId) => ({ spellId })),
  });
  fixture.fields.set(UNIT_FIELDS.POWER1.offset, 300);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  fixture.motion.observe(2n, {
    mapId: 530,
    orientation: 0,
    x: targetX,
    y: 0,
    z: 0,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  const ids = () =>
    fixture.actions
      .observe(context)
      .candidates.map((candidate) => candidate.id);
  const unavailable = () =>
    fixture.actions.observe(context).observation["unavailable"];
  return { ...fixture, advance, ids, unavailable };
}
