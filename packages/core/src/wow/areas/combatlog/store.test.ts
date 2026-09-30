import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import type { CombatlogEntry } from "#wow/areas/combatlog/entries";
import {
  type CombatlogEvent,
  CombatlogStore,
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

function unit(guid: bigint, objectType: number, fields: [number, number][]) {
  return {
    guid,
    objectType,
    rawFields: new Map(fields),
  } as unknown as Entity;
}

function setup(start = 1000, extra: readonly Entity[] = []) {
  let t = start;
  const entities = new Map<bigint, Entity>([
    [PET, owned(PET, 14)],
    [TOTEM, owned(TOTEM, 16)],
    ...extra.map((entity) => [entity.guid, entity] as const),
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

  test("closeFight ends a quiet fight once and emits its totals", () => {
    const { advance, events, store } = setup();
    store.receive([hit(ME, BOAR, 10), hit(BOAR, ME, 4, { outcome: "dodge" })]);
    advance(5999);
    store.closeFight();
    expect(events.filter((event) => event.type === "fight_closed")).toEqual([]);
    advance(1);
    store.closeFight();
    store.closeFight();
    expect(events.filter((event) => event.type === "fight_closed")).toEqual([
      {
        crits: 0,
        dealt: 10,
        healed: 0,
        lastAt: 1000,
        misses: { dodge: 1 },
        startedAt: 1000,
        taken: 4,
        type: "fight_closed",
      },
    ]);
    expect(store.snapshot().fight).toBeUndefined();
    expect(store.snapshot().lastFight).toMatchObject({ dealt: 10, taken: 4 });
  });

  test("an entry after the quiet gap closes the old fight before it counts", () => {
    const { advance, events, store } = setup();
    store.receive([hit(ME, BOAR, 10)]);
    advance(7000);
    store.receive([hit(ME, WOLF, 6)]);
    expect(events.map((event) => event.type)).toEqual([
      "entry",
      "fight_closed",
      "entry",
    ]);
    expect(events[1]).toMatchObject({ dealt: 10, startedAt: 1000 });
    expect(store.snapshot().fight).toMatchObject({ dealt: 6 });
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

  test("a periodic tick with an empty caster marks nobody", () => {
    const { attacked, core, store } = setup();
    store.receive([
      { amount: 5, kind: "periodic_damage", source: 0n, target: ME },
    ]);
    expect(attacked).toEqual([]);
    expect(core.combat.attackers()).toEqual([]);
  });

  test("damage the character deals marks nobody", () => {
    const { attacked, store } = setup();
    store.receive([hit(ME, BOAR, 10)]);
    expect(attacked).toEqual([]);
  });
});

describe("CombatlogStore kills", () => {
  const targeting = (guid: bigint) =>
    unit(ME, 4, [
      [18, Number(guid & 0xff_ff_ff_ffn)],
      [19, Number(guid >> 32n)],
    ]);

  test("names the killer kind from the entity store", () => {
    const { store } = setup(1000, [
      unit(PLAYER, 4, []),
      unit(WOLF, 3, []),
      targeting(BOAR),
    ]);
    for (const killer of [ME, PET, PLAYER, WOLF, STRANGER])
      store.receiveKill({ killer, victim: BOAR });
    expect(store.snapshot().kills.map((kill) => kill.killerKind)).toEqual([
      "self",
      "pet",
      "player",
      "creature",
      "unknown",
    ]);
  });

  test("a kill of the character's target by another player is ourTarget and not bySelf", () => {
    const { events, store } = setup(1000, [
      unit(PLAYER, 4, []),
      targeting(BOAR),
    ]);
    store.receiveKill({ killer: PLAYER, victim: BOAR });
    store.receiveKill({ killer: PLAYER, victim: WOLF });
    expect(store.snapshot().kills).toEqual([
      {
        at: 1000,
        bySelf: false,
        killer: PLAYER,
        killerKind: "player",
        ourTarget: true,
        victim: BOAR,
      },
      {
        at: 1000,
        bySelf: false,
        killer: PLAYER,
        killerKind: "player",
        ourTarget: false,
        victim: WOLF,
      },
    ]);
    expect(events.map((event) => event.type)).toEqual(["kill", "kill"]);
    expect(events[0]).toMatchObject({ bySelf: 0, ourTarget: 1 });
  });

  test("a kill neither counts in the fight nor needs the fight scope", () => {
    const { store } = setup();
    store.receiveKill({ killer: PLAYER, victim: STRANGER });
    const state = store.snapshot();
    expect(state.fight).toBeUndefined();
    expect(state.dropped).toBe(0);
    expect(state.entries).toHaveLength(1);
  });

  test("dispose forgets kills and combo points", () => {
    const { store } = setup();
    store.receiveKill({ killer: ME, victim: BOAR });
    store.receiveComboPoints({ points: 4, target: BOAR });
    store.dispose();
    const state = store.snapshot();
    expect(state.kills).toEqual([]);
    expect(state.comboPoints).toBeUndefined();
  });

  test("0 points on a target also clears the combo points", () => {
    const { store } = setup();
    store.receiveComboPoints({ points: 4, target: BOAR });
    store.receiveComboPoints({ points: 0, target: BOAR });
    expect(store.snapshot().comboPoints).toBeUndefined();
  });
});

describe("CombatlogStore immunities", () => {
  const immune = (source: bigint, target: bigint, spellId: number) =>
    ({
      amount: 0,
      kind: "immune",
      source,
      spellId,
      target,
    }) satisfies Omit<CombatlogEntry, "at">;

  test("records the creature entry and spell the character was refused, once", () => {
    const { advance, store } = setup();
    store.receive([immune(ME, BOAR, 122)]);
    advance(500);
    store.receive([immune(ME, BOAR, 122), immune(ME, WOLF, 122)]);
    expect(store.snapshot().immunities).toEqual([
      { at: 1000, entry: 0x3e_ea, spellId: 122 },
      { at: 1500, entry: 0x3e_eb, spellId: 122 },
    ]);
  });

  test("melee immunity, a player target and another source record nothing", () => {
    const { store } = setup();
    store.receive([
      hit(ME, BOAR, 0, { outcome: "immune" }),
      immune(ME, PLAYER, 122),
      immune(BOAR, ME, 133),
      immune(ME, BOAR, 0),
    ]);
    expect(store.snapshot().immunities).toEqual([]);
  });

  test("a miss with the immune outcome counts as immunity", () => {
    const { store } = setup();
    store.receive([
      {
        amount: 0,
        kind: "miss",
        outcome: "immune",
        source: ME,
        spellId: 8921,
        target: BOAR,
      },
    ]);
    expect(store.snapshot().immunities).toEqual([
      { at: 1000, entry: 0x3e_ea, spellId: 8921 },
    ]);
  });
});
