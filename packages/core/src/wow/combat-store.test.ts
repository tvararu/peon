import { describe, expect, test } from "bun:test";
import { type CombatChange, CombatStore } from "#wow/combat-store";
import type { SpellStart } from "#wow/protocol/spell";

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

describe("CombatStore.applySpellDelayed", () => {
  const applyStart: SpellStart = {
    castCount: 1,
    castItem: 0n,
    caster: ME,
    flags: 0,
    spellId: 133,
    targets: { flags: 2, objectGuid: WOLF },
    timer: 3000,
  };

  test("pushback on the character's cast lengthens the cast and emits a change", () => {
    const { changes, store } = setup();
    store.applySpellStart(applyStart);
    changes.length = 0;
    store.applySpellDelayed({ caster: ME, delayMs: 500 });
    expect(store.record(undefined).casting?.durationMs).toBe(3500);
    expect(changes).toEqual([{ reason: "cast_delayed", type: "cast_started" }]);
  });

  test("pushback on another caster changes nothing", () => {
    const { changes, store } = setup();
    store.applySpellStart(applyStart);
    changes.length = 0;
    store.applySpellDelayed({ caster: WOLF, delayMs: 500 });
    expect(store.record(undefined).casting?.durationMs).toBe(3000);
    expect(changes).toEqual([]);
  });

  test("pushback with no cast changes nothing and emits nothing", () => {
    const { changes, store } = setup();
    store.applySpellDelayed({ caster: ME, delayMs: 500 });
    expect(store.record(undefined).casting).toBeUndefined();
    expect(changes).toEqual([]);
  });
});
