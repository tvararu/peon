import { describe, expect, test } from "bun:test";
import { type CombatChange, CombatStore } from "#wow/combat-store";

const ME = 0x2an;
const WOLF = 0xf1_30_00_3e_eb_00_0a_bdn;

function setup() {
  const store = new CombatStore({
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => ME,
  });
  const changes: CombatChange[] = [];
  store.onChange((change) => changes.push(change));
  return { changes, store };
}

describe("CombatStore.noteHostileDamage", () => {
  test("a unit that is not an attacker yet becomes one and emits attacked once", () => {
    const { changes, store } = setup();
    store.noteHostileDamage(WOLF);
    store.noteHostileDamage(WOLF);
    expect(store.attackers()).toEqual([WOLF]);
    expect(changes).toEqual([{ attacker: WOLF, type: "attacked" }]);
  });

  test("a unit that already swung at the character emits nothing", () => {
    const { changes, store } = setup();
    store.applyAttackStart({ attacker: WOLF, victim: ME });
    changes.length = 0;
    store.noteHostileDamage(WOLF);
    expect(changes).toEqual([]);
  });
});
