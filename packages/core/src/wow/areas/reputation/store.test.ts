import { describe, expect, test } from "bun:test";
import {
  BLOOD_ELF_MASK,
  MAGE_MASK,
  REPUTATION_FACTIONS,
  reputationDbcSource,
} from "#test-support/areas/reputation";
import { testStores } from "#test-support/session-fixtures";
import { loadFactionCatalog } from "#wow/areas/reputation/catalog";
import {
  FACTION_FLAGS,
  type ReputationEvent,
  ReputationStore,
} from "#wow/areas/reputation/store";
import type { SessionDeps } from "#wow/session-stores";

const SILVERMOON = 14;
const BLOODSAIL = 20;
const UNKNOWN = 30;
const NONE = 0xff_ff_ff_ff;

async function setup(options: { catalog?: boolean } = {}) {
  let t = 1000;
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now: () => t,
    selfGuid: () => 0x2an,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new ReputationStore(deps, testStores(deps));
  if (options.catalog ?? true) {
    store.setCatalog(
      await loadFactionCatalog(reputationDbcSource(REPUTATION_FACTIONS)),
    );
    store.setCharacter(BLOOD_ELF_MASK, MAGE_MASK);
  }
  const seen: ReputationEvent[] = [];
  store.onEvent((event) => seen.push(event));
  store.initialize({
    entries: [
      ...new Array(SILVERMOON).fill({ flags: 0, standing: 0 }),
      { flags: 0x11, standing: 250 },
      ...new Array(BLOODSAIL - SILVERMOON - 1).fill({ flags: 0, standing: 0 }),
      { flags: 0, standing: 100 },
      ...new Array(UNKNOWN - BLOODSAIL - 1).fill({ flags: 0, standing: 0 }),
      { flags: 0x01, standing: 0 },
      ...new Array(127 - UNKNOWN).fill({ flags: 0, standing: 0 }),
    ],
  });
  return {
    advance: (ms: number) => {
      t += ms;
    },
    seen,
    store,
  };
}

const standing = (repListId: number, delta: number, increased = false) => ({
  entries: [{ repListId, standing: delta }],
  increased,
});

const row = (store: ReputationStore, repListId: number) =>
  store.list().find((entry) => entry.repListId === repListId);

describe("reputation store", () => {
  test("SMSG_INITIALIZE_FACTIONS replaces the list and counts known and visible factions", async () => {
    const { seen, store } = await setup();
    expect(seen).toEqual([{ count: 3, type: "initialized", visible: 2 }]);
    expect(store.snapshot().factions.map((entry) => entry.repListId)).toEqual([
      SILVERMOON,
      BLOODSAIL,
      UNKNOWN,
    ]);
    expect(store.snapshot().catalog).toBe(true);
    store.initialize({ entries: [{ flags: 0x01, standing: 5 }] });
    expect(store.list().map((entry) => entry.repListId)).toEqual([0]);
  });

  test("SMSG_SET_FACTION_STANDING reports base plus delta, rank and flags kept", async () => {
    const { seen, store } = await setup();
    store.setStanding(standing(SILVERMOON, 275, true));
    store.setStanding(standing(SILVERMOON, 6000, true));
    expect(seen.slice(1)).toEqual([
      {
        after: 3275,
        atWar: false,
        before: 3250,
        factionId: 911,
        increased: true,
        name: "Silvermoon City",
        rank: 4,
        rankChanged: false,
        repListId: SILVERMOON,
        type: "standing_changed",
      },
      {
        after: 9000,
        atWar: false,
        before: 3275,
        factionId: 911,
        increased: true,
        name: "Silvermoon City",
        rank: 5,
        rankChanged: true,
        repListId: SILVERMOON,
        type: "standing_changed",
      },
    ]);
    expect(row(store, SILVERMOON)?.visible).toBe(true);
    expect(store.standing(SILVERMOON)).toBe(9000);
    expect(store.rank(SILVERMOON)).toBe(5);
  });

  test("a drop to Hostile infers AT_WAR and a rise clears it where war can be set (ReputationMgr.cpp:430-436)", async () => {
    const { seen, store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    expect(seen.at(-1)).toMatchObject({ after: -3200, atWar: true, rank: 1 });
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
    store.setStanding(standing(BLOODSAIL, 0, true));
    expect(seen.at(-1)).toMatchObject({ after: -2500, atWar: false, rank: 2 });
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
    store.setStanding(standing(SILVERMOON, -9500));
    expect(seen.at(-1)).toMatchObject({ after: -6500, atWar: false, rank: 0 });
  });

  test("a new faction list drops the inferred flags", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.initialize({
      entries: [
        ...new Array(BLOODSAIL).fill({ flags: 0, standing: 0 }),
        { flags: 0x01, standing: -700 },
      ],
    });
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
  });

  test("SMSG_SET_FACTION_VISIBLE sets VISIBLE", async () => {
    const { seen, store } = await setup();
    store.setVisible({ repListId: BLOODSAIL });
    expect(seen.at(-1)).toEqual({
      name: "Bloodsail Buccaneers",
      repListId: BLOODSAIL,
      type: "visible",
    });
    expect(row(store, BLOODSAIL)?.visible).toBe(true);
    expect(FACTION_FLAGS.VISIBLE).toBe(0x01);
  });

  test("the watched field reports changes only, and 0xFFFFFFFF is none (Player.cpp:549)", async () => {
    const { seen, store } = await setup();
    store.receiveWatched(SILVERMOON);
    store.receiveWatched(SILVERMOON);
    expect(store.snapshot().watched).toBe(SILVERMOON);
    expect(row(store, SILVERMOON)?.watched).toBe(true);
    store.receiveWatched(NONE);
    expect(seen.slice(1)).toEqual([
      {
        name: "Silvermoon City",
        repListId: SILVERMOON,
        type: "watched_changed",
      },
      { name: undefined, repListId: undefined, type: "watched_changed" },
    ]);
    expect(store.snapshot().watched).toBeUndefined();
  });

  test("list rows give rank bounds, most recently changed first, and can keep only visible ones", async () => {
    const { advance, store } = await setup();
    advance(10);
    store.setStanding(standing(BLOODSAIL, 150));
    advance(10);
    store.setStanding(standing(SILVERMOON, 300));
    expect(store.list().map((entry) => entry.repListId)).toEqual([
      SILVERMOON,
      BLOODSAIL,
      UNKNOWN,
    ]);
    expect(
      store.list({ visibleOnly: true }).map((entry) => entry.repListId),
    ).toEqual([SILVERMOON, UNKNOWN]);
    expect(row(store, SILVERMOON)).toEqual({
      atWar: false,
      changedAt: 1020,
      factionId: 911,
      inactive: false,
      name: "Silvermoon City",
      rank: 4,
      rankCeiling: 8999,
      rankFloor: 3000,
      repListId: SILVERMOON,
      standing: 3300,
      visible: true,
      watched: false,
    });
  });

  test("with no catalog the store keeps deltas and knows no rank", async () => {
    const { seen, store } = await setup({ catalog: false });
    store.setStanding(standing(SILVERMOON, 275));
    expect(seen.at(-1)).toEqual({
      after: 275,
      atWar: false,
      before: 250,
      factionId: undefined,
      increased: false,
      name: undefined,
      rank: undefined,
      rankChanged: false,
      repListId: SILVERMOON,
      type: "standing_changed",
    });
    expect(row(store, SILVERMOON)).toMatchObject({
      rank: undefined,
      rankFloor: undefined,
      standing: 275,
    });
    expect(store.snapshot().catalog).toBe(false);
  });

  test("clear empties the store without an event, dispose drops listeners", async () => {
    const { seen, store } = await setup();
    store.receiveWatched(SILVERMOON);
    const before = seen.length;
    store.clear();
    expect(store.snapshot()).toEqual({
      catalog: true,
      factions: [],
      watched: undefined,
    });
    store.dispose();
    store.setVisible({ repListId: BLOODSAIL });
    expect(seen).toHaveLength(before);
  });
});
