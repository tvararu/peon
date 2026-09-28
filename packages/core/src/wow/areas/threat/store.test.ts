import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { type ThreatEvent, ThreatStore } from "#wow/areas/threat/store";
import type { SessionDeps } from "#wow/session-stores";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;
const ME = 0x2an;
const PARTNER = 0x2bn;
const PET = 0xf1_40_00_00_01_00_00_07n;

function setup(start = 1000) {
  let t = start;
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now: () => t,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new ThreatStore(deps, testStores(deps));
  const seen: ThreatEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      t += ms;
    },
    seen,
    store,
  };
}

function table(store: ThreatStore, unit = UNIT) {
  return store.snapshot().tables.find((row) => row.unit === unit);
}

describe("ThreatStore", () => {
  test("starts with no tables", () => {
    expect(setup().store.snapshot()).toEqual({ tables: [] });
  });

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

  test("a clear deletes the table", () => {
    const { store } = setup();
    store.update({
      entries: [{ threat: 500, victim: ME }],
      newVictim: ME,
      unit: UNIT,
    });
    store.clearTable({ unit: UNIT });
    expect(store.snapshot().tables).toEqual([]);
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
