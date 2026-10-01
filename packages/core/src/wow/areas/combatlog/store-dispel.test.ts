import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import type { CombatlogWire } from "#wow/areas/combatlog/entries";
import { CombatlogStore } from "#wow/areas/combatlog/store";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const MAGE = 0xf1_30_00_3e_ea_00_0a_bcn;

function setup() {
  let clock = 1000;
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now: () => clock,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new CombatlogStore(deps, testStores(deps));
  const seen: string[] = [];
  store.onEvent((event) => seen.push(event.type));
  return { advance: (ms: number) => (clock += ms), seen, store };
}

const dispel = (kind: CombatlogWire["kind"]): CombatlogWire => ({
  amount: 0,
  extra: 168,
  kind,
  source: MAGE,
  spellId: 527,
  target: ME,
});

describe("utility kinds and fight totals", () => {
  test.each(["dispel", "dispel_failed", "steal", "execute"] as const)(
    "a %s entry on the character opens no fight but is kept and emitted",
    (kind) => {
      const { advance, seen, store } = setup();
      store.receive([dispel(kind)]);
      advance(60_000);
      store.closeFight();
      expect(store.snapshot().fight).toBeUndefined();
      expect(store.snapshot().entries.map((e) => e.kind)).toEqual([kind]);
      expect(seen).toEqual(["entry"]);
    },
  );

  test("during an open fight a dispel leaves the totals and lastAt unchanged", () => {
    const { advance, store } = setup();
    store.receive([{ amount: 7, kind: "melee", source: MAGE, target: ME }]);
    const before = structuredClone(store.snapshot().fight);
    advance(2000);
    store.receive([dispel("dispel")]);
    expect(store.snapshot().fight).toEqual(before);
  });
});
