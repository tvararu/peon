import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { type ThreatEvent, ThreatStore } from "#wow/areas/threat/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;
const ME = 0x2an;
const PARTNER = 0x2bn;
const PET = 0xf1_40_00_00_01_00_00_07n;

function selfWithSummon(pet: bigint | undefined): Entity {
  const rawFields = new Map<number, number>();
  if (pet !== undefined) {
    rawFields.set(UNIT_FIELDS.SUMMON.offset, Number(pet & 0xff_ff_ff_ffn));
    rawFields.set(UNIT_FIELDS.SUMMON.offset + 1, Number(pet >> 32n));
  }
  return {
    entry: 0,
    guid: ME,
    name: undefined,
    objectType: ObjectType.OBJECT,
    position: undefined,
    rawFields,
    scale: 1,
  };
}

function setup(start = 1000, self?: Entity) {
  let t = start;
  const deps: SessionDeps = {
    getEntity: (guid) => (guid === ME ? self : undefined),
    now: () => t,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const core = testStores(deps);
  const store = new ThreatStore(deps, core);
  const seen: ThreatEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      t += ms;
    },
    core,
    seen,
    store,
  };
}

function table(store: ThreatStore, unit = UNIT) {
  return store.snapshot().tables.find((row) => row.unit === unit);
}

describe("ThreatStore", () => {
  test("a highest update sets the victim and a later update keeps it", () => {
    const { store, advance } = setup();
    store.update({
      entries: [{ threat: 500, victim: PET }],
      newVictim: PET,
      unit: UNIT,
    });
    advance(1000);
    store.update({
      entries: [
        { threat: 500, victim: PET },
        { threat: 200, victim: ME },
      ],
      newVictim: undefined,
      unit: UNIT,
    });
    expect(table(store)).toMatchObject({
      unit: UNIT,
      updatedAt: 2000,
      victim: PET,
    });
    expect(table(store)?.entries.map((entry) => entry.victim)).toEqual([
      PET,
      ME,
    ]);
  });

  test("an update replaces the whole list", () => {
    const { store } = setup();
    store.update({
      entries: [
        { threat: 500, victim: PET },
        { threat: 200, victim: ME },
      ],
      newVictim: PET,
      unit: UNIT,
    });
    store.update({
      entries: [{ threat: 700, victim: PET }],
      newVictim: undefined,
      unit: UNIT,
    });
    expect(table(store)?.entries).toEqual([
      { isVictim: true, pct: 100, threat: 700, victim: PET },
    ]);
  });

  test("entries sort by threat with the share of the top and the pull thresholds", () => {
    const { store } = setup();
    store.update({
      entries: [
        { threat: 300, victim: ME },
        { threat: 900, victim: PET },
        { threat: 100, victim: PARTNER },
      ],
      newVictim: PET,
      unit: UNIT,
    });
    expect(table(store)).toEqual({
      entries: [
        { isVictim: true, pct: 100, threat: 900, victim: PET },
        { isVictim: false, pct: 33, threat: 300, victim: ME },
        { isVictim: false, pct: 11, threat: 100, victim: PARTNER },
      ],
      pullAt: { melee: 990, ranged: 1170 },
      unit: UNIT,
      updatedAt: 1000,
      victim: PET,
    });
  });

  test("a table with no victim, or a victim not on its list, has no pull thresholds", () => {
    const { store } = setup();
    store.update({
      entries: [{ threat: 300, victim: ME }],
      newVictim: undefined,
      unit: UNIT,
    });
    expect(table(store)?.pullAt).toBeUndefined();
    store.update({
      entries: [{ threat: 300, victim: ME }],
      newVictim: PET,
      unit: OTHER,
    });
    expect(table(store, OTHER)?.pullAt).toBeUndefined();
  });

  test("an empty list and a zero top threat give no bad shares", () => {
    const { store } = setup();
    store.update({ entries: [], newVictim: undefined, unit: UNIT });
    expect(table(store)?.entries).toEqual([]);
    store.update({
      entries: [{ threat: 0, victim: ME }],
      newVictim: ME,
      unit: UNIT,
    });
    expect(table(store)?.entries).toEqual([
      { isVictim: true, pct: 100, threat: 0, victim: ME },
    ]);
    expect(table(store)?.pullAt).toEqual({ melee: 0, ranged: 0 });
  });

  test("a remove deletes one entry and drops the victim when it was the victim", () => {
    const { store } = setup();
    store.update({
      entries: [
        { threat: 500, victim: PET },
        { threat: 200, victim: ME },
      ],
      newVictim: PET,
      unit: UNIT,
    });
    store.remove({ unit: UNIT, victim: ME });
    expect(table(store)).toMatchObject({ victim: PET });
    expect(table(store)?.entries.map((entry) => entry.victim)).toEqual([PET]);
    store.remove({ unit: UNIT, victim: PET });
    expect(table(store)).toMatchObject({
      entries: [],
      pullAt: undefined,
      victim: undefined,
    });
  });

  test("forget drops one table in silence and clear drops them all", () => {
    const { store, seen } = setup();
    for (const unit of [UNIT, OTHER])
      store.update({
        entries: [{ threat: 500, victim: ME }],
        newVictim: undefined,
        unit,
      });
    seen.length = 0;
    store.forget(UNIT);
    expect(store.snapshot().tables.map((row) => row.unit)).toEqual([OTHER]);
    store.clear();
    expect(store.snapshot().tables).toEqual([]);
    expect(seen).toEqual([]);
  });

  test("events: table, victim_changed, removed and cleared", () => {
    const { store, seen } = setup();
    store.update({
      entries: [{ threat: 500, victim: PET }],
      newVictim: PET,
      unit: UNIT,
    });
    store.update({
      entries: [{ threat: 600, victim: PET }],
      newVictim: PET,
      unit: UNIT,
    });
    store.update({
      entries: [
        { threat: 600, victim: PET },
        { threat: 800, victim: ME },
      ],
      newVictim: undefined,
      unit: UNIT,
    });
    store.update({
      entries: [
        { threat: 600, victim: PET },
        { threat: 800, victim: ME },
      ],
      newVictim: ME,
      unit: UNIT,
    });
    store.remove({ unit: UNIT, victim: PET });
    store.clearTable({ unit: UNIT });
    expect(seen).toEqual([
      { from: undefined, to: PET, type: "victim_changed", unit: UNIT },
      {
        entries: [{ isVictim: true, pct: 100, threat: 600, victim: PET }],
        type: "table",
        unit: UNIT,
        victim: PET,
      },
      {
        entries: [
          { isVictim: false, pct: 100, threat: 800, victim: ME },
          { isVictim: true, pct: 75, threat: 600, victim: PET },
        ],
        type: "table",
        unit: UNIT,
        victim: PET,
      },
      { from: PET, to: ME, type: "victim_changed", unit: UNIT },
      { type: "removed", unit: UNIT, victim: PET },
      { type: "cleared", unit: UNIT },
    ]);
  });

  test("snapshots and events are copies", () => {
    const { store, seen } = setup();
    store.update({
      entries: [{ threat: 500, victim: ME }],
      newVictim: undefined,
      unit: UNIT,
    });
    const copy = store.snapshot();
    const event = seen[0];
    if (event?.type !== "table") throw new Error("no table event");
    Object.assign(event.entries[0] ?? {}, { threat: 1 });
    Object.assign(copy.tables[0]?.entries[0] ?? {}, { threat: 2 });
    expect(table(store)?.entries[0]?.threat).toBe(500);
  });

  test("dispose drops the listeners", () => {
    const { store, seen } = setup();
    store.dispose();
    store.clearTable({ unit: UNIT });
    expect(seen).toEqual([]);
  });
});

describe("ThreatStore reactions and target breaks", () => {
  test("keeps the last reaction of each unit and emits reaction", () => {
    const { store, seen, advance } = setup();
    store.reaction({ code: 0, reaction: "alert", unit: UNIT });
    advance(500);
    store.reaction({ code: 2, reaction: "hostile", unit: UNIT });
    store.reaction({ code: 9, reaction: "unknown", unit: OTHER });
    expect(store.snapshot().reactions).toEqual([
      { at: 1500, code: 2, reaction: "hostile", unit: UNIT },
      { at: 1500, code: 9, reaction: "unknown", unit: OTHER },
    ]);
    expect(store.snapshot().petReaction).toBeUndefined();
    expect(seen).toEqual([
      { code: 0, pet: false, reaction: "alert", type: "reaction", unit: UNIT },
      {
        code: 2,
        pet: false,
        reaction: "hostile",
        type: "reaction",
        unit: UNIT,
      },
      {
        code: 9,
        pet: false,
        reaction: "unknown",
        type: "reaction",
        unit: OTHER,
      },
    ]);
  });

  test("a reaction from the pet in the character's summon field sets petReaction", () => {
    const { store, seen } = setup(1000, selfWithSummon(PET));
    store.reaction({ code: 2, reaction: "hostile", unit: PET });
    expect(store.snapshot().petReaction).toEqual({ at: 1000, pet: PET });
    expect(store.snapshot().reactions).toEqual([
      { at: 1000, code: 2, reaction: "hostile", unit: PET },
    ]);
    expect(seen).toEqual([
      { code: 2, pet: true, reaction: "hostile", type: "reaction", unit: PET },
    ]);
  });

  test("with no summon field the last pet command names the pet", () => {
    const { store, seen, core } = setup(1000, selfWithSummon(undefined));
    store.reaction({ code: 2, reaction: "hostile", unit: PET });
    expect(store.snapshot().petReaction).toBeUndefined();
    core.combat.petCommanded(PET, UNIT);
    store.reaction({ code: 2, reaction: "hostile", unit: PET });
    expect(store.snapshot().petReaction).toEqual({ at: 1000, pet: PET });
    expect(seen.map((event) => event.type === "reaction" && event.pet)).toEqual(
      [false, true],
    );
  });

  test("the summon field wins over an older pet command", () => {
    const other = 0xf1_40_00_00_01_00_00_08n;
    const { store, core } = setup(1000, selfWithSummon(PET));
    core.combat.petCommanded(other, UNIT);
    store.reaction({ code: 2, reaction: "hostile", unit: other });
    expect(store.snapshot().petReaction).toBeUndefined();
  });

  test("forget of the pet drops the pet reaction", () => {
    const { store } = setup(1000, selfWithSummon(PET));
    store.reaction({ code: 2, reaction: "hostile", unit: PET });
    store.forget(PET);
    expect(store.snapshot()).toMatchObject({
      petReaction: undefined,
      reactions: [],
    });
  });

  test("forget drops that unit's reaction and clear drops every reaction", () => {
    const { store } = setup(1000, selfWithSummon(PET));
    store.reaction({ code: 2, reaction: "hostile", unit: UNIT });
    store.reaction({ code: 2, reaction: "hostile", unit: OTHER });
    store.reaction({ code: 2, reaction: "hostile", unit: PET });
    store.forget(UNIT);
    expect(store.snapshot().reactions.map((row) => row.unit)).toEqual([
      OTHER,
      PET,
    ]);
    store.clear();
    expect(store.snapshot()).toMatchObject({
      petReaction: undefined,
      reactions: [],
    });
  });
});
