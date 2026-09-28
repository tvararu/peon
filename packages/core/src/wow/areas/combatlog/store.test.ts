import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import {
  type CombatlogEntry,
  type CombatlogEvent,
  CombatlogStore,
  meleeEntry,
  spellDamageEntry,
} from "#wow/areas/combatlog/store";
import type { Entity } from "#wow/entity-store";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const PET = 0xf1_40_00_00_01_00_00_07n;
const TOTEM = 0xf1_30_00_00_02_00_00_08n;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;
const WOLF = 0xf1_30_00_3e_eb_00_0a_bdn;
const PLAYER = 0x2bn;
const STRANGER = 0x2cn;

function owned(guid: bigint, offset: number): Entity {
  const low = Number(ME & 0xff_ff_ff_ffn);
  const high = Number(ME >> 32n);
  return {
    guid,
    objectType: 3,
    rawFields: new Map([
      [offset, low],
      [offset + 1, high],
    ]),
  } as unknown as Entity;
}

function setup(start = 1000) {
  let t = start;
  const entities = new Map<bigint, Entity>([
    [PET, owned(PET, 14)],
    [TOTEM, owned(TOTEM, 16)],
  ]);
  const deps: SessionDeps = {
    getEntity: (guid) => entities.get(guid),
    now: () => t,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const core = testStores(deps);
  const store = new CombatlogStore(deps, core);
  const events: CombatlogEvent[] = [];
  store.onEvent((event) => events.push(event));
  const attacked: bigint[] = [];
  core.combat.onChange((change) => {
    if (change.type === "attacked" && change.attacker !== undefined)
      attacked.push(change.attacker);
  });
  return {
    advance: (ms: number) => {
      t += ms;
    },
    attacked,
    core,
    events,
    store,
  };
}

function hit(
  source: bigint,
  target: bigint,
  amount: number,
  extra: Partial<CombatlogEntry> = {},
): Omit<CombatlogEntry, "at"> {
  return { amount, kind: "melee", source, target, ...extra };
}

describe("CombatlogStore scope", () => {
  test("keeps entries of the character, its pet and its guardian and drops a stranger's", () => {
    const { store } = setup();
    store.receive([
      hit(ME, BOAR, 10),
      hit(PET, WOLF, 4),
      hit(TOTEM, WOLF, 2),
      hit(PLAYER, STRANGER, 9),
    ]);
    const state = store.snapshot();
    expect(state.entries.map((entry) => entry.source)).toEqual([
      ME,
      PET,
      TOTEM,
    ]);
    expect(state.dropped).toBe(1);
  });

  test("keeps another unit's entry against a unit in the current fight", () => {
    const { store } = setup();
    store.receive([hit(ME, BOAR, 10), hit(PLAYER, BOAR, 7)]);
    expect(store.snapshot().entries).toHaveLength(2);
    expect(store.snapshot().dropped).toBe(0);
  });

  test("keeps a unit's entry once it attacks the character", () => {
    const { core, store } = setup();
    core.combat.applyAttackStart({ attacker: WOLF, victim: ME });
    store.receive([hit(PLAYER, WOLF, 3)]);
    expect(store.snapshot().entries).toHaveLength(1);
  });

  test("the ring keeps the last 500 entries", () => {
    const { store } = setup();
    store.receive(Array.from({ length: 503 }, (_, i) => hit(ME, BOAR, i)));
    const { entries } = store.snapshot();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.amount).toBe(3);
    expect(entries.at(-1)?.amount).toBe(502);
  });

  test("a miss with no damage is still one entry and one event", () => {
    const { events, store } = setup();
    store.receive([hit(BOAR, ME, 0, { outcome: "dodge" })]);
    expect(store.snapshot().entries).toEqual([
      {
        amount: 0,
        at: 1000,
        kind: "melee",
        outcome: "dodge",
        source: BOAR,
        target: ME,
      },
    ]);
    expect(events).toEqual([
      {
        amount: 0,
        at: 1000,
        kind: "melee",
        outcome: "dodge",
        source: BOAR,
        target: ME,
        type: "entry",
      },
    ]);
  });

  test("a crit keeps its boolean in state and emits a plain number", () => {
    const { events, store } = setup();
    store.receive([hit(ME, BOAR, 10, { crit: true }), hit(ME, BOAR, 4)]);
    expect(store.snapshot().entries.map((entry) => entry.crit)).toEqual([
      true,
      undefined,
    ]);
    expect(
      events.map((event) => ("crit" in event ? event.crit : "none")),
    ).toEqual([1, "none"]);
    expect(
      events.every((event) =>
        Object.values(event).every((value) => typeof value !== "boolean"),
      ),
    ).toBe(true);
  });
});

describe("CombatlogStore fight window", () => {
  test("opens on the first entry of the character and closes after 6 s of quiet", () => {
    const { advance, store } = setup();
    expect(store.snapshot().fight).toBeUndefined();
    store.receive([hit(ME, BOAR, 10)]);
    advance(2000);
    store.receive([hit(BOAR, ME, 4)]);
    expect(store.snapshot().fight).toMatchObject({
      dealt: 10,
      lastAt: 3000,
      startedAt: 1000,
      taken: 4,
    });
    advance(5999);
    expect(store.snapshot().fight).toBeDefined();
    advance(1);
    const closed = store.snapshot();
    expect(closed.fight).toBeUndefined();
    expect(closed.lastFight).toMatchObject({ dealt: 10, taken: 4 });
  });

  test("a stranger's entry does not keep the fight open", () => {
    const { advance, store } = setup();
    store.receive([hit(ME, BOAR, 10)]);
    advance(4000);
    store.receive([hit(PLAYER, BOAR, 3)]);
    advance(2500);
    store.receive([hit(ME, WOLF, 6)]);
    const state = store.snapshot();
    expect(state.lastFight).toMatchObject({ dealt: 10, startedAt: 1000 });
    expect(state.fight).toMatchObject({ dealt: 6, startedAt: 7500 });
  });

  test("a closed fight forgets its units", () => {
    const { advance, store } = setup();
    store.receive([hit(ME, BOAR, 10)]);
    advance(7000);
    store.receive([hit(PLAYER, BOAR, 3)]);
    expect(store.snapshot().dropped).toBe(1);
  });

  test("totals sum dealt, taken, misses by outcome and crits", () => {
    const { store } = setup();
    store.receive([
      hit(ME, BOAR, 10, { crit: true }),
      hit(PET, BOAR, 5),
      hit(ME, BOAR, 0, { outcome: "dodge" }),
      hit(BOAR, ME, 0, { outcome: "parry" }),
      hit(BOAR, ME, 7),
      {
        amount: 21,
        crit: true,
        kind: "spell_damage",
        source: ME,
        spellId: 133,
        target: BOAR,
      },
      { amount: 30, kind: "heal", source: PLAYER, target: ME },
      hit(PLAYER, BOAR, 50),
    ]);
    expect(store.snapshot().fight).toEqual({
      crits: 2,
      dealt: 36,
      healed: 30,
      lastAt: 1000,
      misses: { dodge: 1, parry: 1 },
      startedAt: 1000,
      taken: 7,
    });
  });
});

describe("CombatlogStore attackers", () => {
  test("damage from a caster that never swung marks it as an attacker once", () => {
    const { attacked, core, store } = setup();
    const bolt = {
      amount: 12,
      kind: "spell_damage" as const,
      source: WOLF,
      spellId: 9053,
      target: ME,
    };
    store.receive([bolt]);
    store.receive([bolt]);
    expect(attacked).toEqual([WOLF]);
    expect(core.combat.attackers()).toEqual([WOLF]);
  });

  test("damage the character deals marks nobody", () => {
    const { attacked, store } = setup();
    store.receive([hit(ME, BOAR, 10)]);
    expect(attacked).toEqual([]);
  });
});

describe("entry builders", () => {
  test("a swing becomes one melee entry with summed absorbs and its outcome", () => {
    expect(
      meleeEntry({
        absorbed: [3, 1],
        attacker: BOAR,
        crit: false,
        crushing: false,
        glancing: false,
        hitInfo: 0x42,
        meleeSpellId: 0,
        miss: false,
        offhand: false,
        overkill: 0,
        parts: [
          { amount: 20, schoolMask: 1 },
          { amount: 8, schoolMask: 4 },
        ],
        resisted: [],
        target: ME,
        total: 28,
        victimState: "hit",
      }),
    ).toEqual({
      absorbed: 4,
      amount: 28,
      kind: "melee",
      schoolMask: 5,
      source: BOAR,
      target: ME,
    });
  });

  test("a missed or dodged swing names its outcome", () => {
    const base = {
      absorbed: [],
      attacker: ME,
      crit: false,
      crushing: false,
      glancing: false,
      hitInfo: 0x10,
      meleeSpellId: 0,
      miss: true,
      offhand: false,
      overkill: 0,
      parts: [{ amount: 0, schoolMask: 1 }],
      resisted: [],
      target: BOAR,
      total: 0,
      victimState: "intact",
    };
    expect(meleeEntry(base).outcome).toBe("miss");
    expect(
      meleeEntry({ ...base, hitInfo: 0x2, miss: false, victimState: "parry" })
        .outcome,
    ).toBe("parry");
  });

  test("a spell hit becomes one spell_damage entry", () => {
    expect(
      spellDamageEntry({
        absorbed: 0,
        amount: 31,
        attacker: ME,
        blocked: 0,
        crit: true,
        hitFlags: 2,
        overkill: 4,
        physical: false,
        resisted: 3,
        schoolMask: 4,
        spellId: 133,
        split: false,
        target: BOAR,
      }),
    ).toEqual({
      amount: 31,
      crit: true,
      kind: "spell_damage",
      over: 4,
      resisted: 3,
      schoolMask: 4,
      source: ME,
      spellId: 133,
      target: BOAR,
    });
  });
});
