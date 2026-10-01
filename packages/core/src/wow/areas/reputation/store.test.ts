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
        wasAtWar: false,
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
        wasAtWar: false,
      },
    ]);
    expect(row(store, SILVERMOON)?.visible).toBe(true);
    expect(store.standing(SILVERMOON)).toBe(9000);
    expect(store.rank(SILVERMOON)).toBe(5);
  });

  test("a drop to Hostile infers AT_WAR and a rise clears it where war can be set (ReputationMgr.cpp:430-436)", async () => {
    const { seen, store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    expect(seen.at(-1)).toMatchObject({
      after: -3200,
      atWar: true,
      rank: 1,
      wasAtWar: false,
    });
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
    store.setStanding(standing(BLOODSAIL, 0, true));
    expect(seen.at(-1)).toMatchObject({
      after: -2500,
      atWar: false,
      rank: 2,
      wasAtWar: true,
    });
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
      wasAtWar: false,
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
      forced: [],
      watched: undefined,
    });
    store.dispose();
    store.setVisible({ repListId: BLOODSAIL });
    expect(seen).toHaveLength(before);
  });

  test("SMSG_SET_FORCED_REACTIONS replaces the list and reports what it added and removed", async () => {
    const { seen, store } = await setup();
    store.setForced({
      reactions: [
        { factionId: 87, rank: 4 },
        { factionId: 911, rank: 0 },
      ],
    });
    store.setForced({
      reactions: [
        { factionId: 911, rank: 5 },
        { factionId: 1015, rank: 3 },
      ],
    });
    expect(seen.slice(1)).toEqual([
      {
        added: [
          { factionId: 87, name: "Bloodsail Buccaneers", rank: 4 },
          { factionId: 911, name: "Silvermoon City", rank: 0 },
        ],
        removed: [],
        type: "forced_changed",
      },
      {
        added: [
          { factionId: 911, name: "Silvermoon City", rank: 5 },
          { factionId: 1015, name: undefined, rank: 3 },
        ],
        removed: [
          { factionId: 87, name: "Bloodsail Buccaneers", rank: 4 },
          { factionId: 911, name: "Silvermoon City", rank: 0 },
        ],
        type: "forced_changed",
      },
    ]);
    expect(store.forcedRank(911)).toBe(5);
    expect(store.forcedRank(1015)).toBe(3);
    expect(store.forcedRank(87)).toBeUndefined();
    expect(store.snapshot().forced).toEqual([
      { factionId: 911, name: "Silvermoon City", rank: 5 },
      { factionId: 1015, name: undefined, rank: 3 },
    ]);
  });

  test("an unchanged forced list in another order raises no event", async () => {
    const { seen, store } = await setup();
    store.setForced({ reactions: [] });
    store.setForced({
      reactions: [
        { factionId: 87, rank: 4 },
        { factionId: 911, rank: 0 },
      ],
    });
    store.setForced({
      reactions: [
        { factionId: 911, rank: 0 },
        { factionId: 87, rank: 4 },
      ],
    });
    expect(
      seen.filter((event) => event.type === "forced_changed"),
    ).toHaveLength(1);
  });

  test("a new faction list keeps the forced reactions and clear drops them", async () => {
    const { store } = await setup();
    store.setForced({ reactions: [{ factionId: 87, rank: 4 }] });
    store.initialize({ entries: [] });
    expect(store.forcedRank(87)).toBe(4);
    store.clear();
    expect(store.forcedRank(87)).toBeUndefined();
    expect(store.snapshot().forced).toEqual([]);
  });

  test("factionRank and factionAtWar read a Faction.dbc id through its list id", async () => {
    const { store } = await setup();
    expect(store.factionRank(911)).toBe(4);
    expect(store.factionRank(87)).toBe(2);
    expect(store.factionRank(589)).toBeUndefined();
    expect(store.factionRank(999)).toBeUndefined();
    expect(store.factionAtWar(87)).toBe(false);
    store.setStanding(standing(BLOODSAIL, -700));
    expect(store.factionRank(87)).toBe(1);
    expect(store.factionAtWar(87)).toBe(true);
    store.initialize({ entries: [] });
    expect(store.factionRank(911)).toBe(4);
    expect(store.factionAtWar(911)).toBe(false);
  });

  test("with no catalog no faction has a reputation rank", async () => {
    const { store } = await setup({ catalog: false });
    expect(store.factionRank(911)).toBeUndefined();
    expect(store.factionAtWar(911)).toBe(false);
  });
});

describe("reputation store pending flags", () => {
  test("a pending war flag shows in the row and raises flags_pending until the next list (ReputationMgr.cpp:195-231)", async () => {
    const { seen, store } = await setup();
    store.setPendingFlag(UNKNOWN, "atWar", true);
    expect(seen.at(-1)).toEqual({
      atWar: true,
      name: undefined,
      repListId: UNKNOWN,
      type: "flags_pending",
    });
    expect(row(store, UNKNOWN)?.atWar).toBe(true);
    expect(store.flagsOf(UNKNOWN)).toBe(0x03);
    store.initialize({
      entries: [
        ...new Array(UNKNOWN).fill({ flags: 0, standing: 0 }),
        { flags: 0x01, standing: 0 },
      ],
    });
    expect(row(store, UNKNOWN)?.atWar).toBe(false);
  });

  test("a pending inactive flag clears and sets independently of war", async () => {
    const { seen, store } = await setup();
    store.setPendingFlag(SILVERMOON, "inactive", true);
    expect(row(store, SILVERMOON)?.inactive).toBe(true);
    expect(seen.at(-1)).toMatchObject({
      inactive: true,
      type: "flags_pending",
    });
    store.setPendingFlag(SILVERMOON, "inactive", false);
    expect(row(store, SILVERMOON)?.inactive).toBe(false);
    expect(row(store, SILVERMOON)?.atWar).toBe(false);
  });

  test("a pending flag on a slot the list left out creates the slot", async () => {
    const { store } = await setup();
    expect(store.flagsOf(50)).toBeUndefined();
    store.setPendingFlag(50, "atWar", true);
    expect(row(store, 50)?.atWar).toBe(true);
  });

  test("an inferred war flag from a standing change wins over an older pending peace", async () => {
    const { store } = await setup();
    store.setPendingFlag(BLOODSAIL, "atWar", false);
    store.setStanding(standing(BLOODSAIL, -700));
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
  });

  test("an unchanged standing flushed with an unrelated gain keeps a pending peace (ReputationMgr.cpp:193-202,373,532)", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.setPendingFlag(BLOODSAIL, "atWar", false);
    store.setStanding({
      entries: [
        { repListId: SILVERMOON, standing: 300 },
        { repListId: BLOODSAIL, standing: -700 },
      ],
      increased: true,
    });
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
    expect((store.flagsOf(BLOODSAIL) ?? 0) & FACTION_FLAGS.AT_WAR).toBe(0);
    store.setPendingFlag(BLOODSAIL, "atWar", true);
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
  });

  test("an unchanged standing that heads the packet infers war after a peace request (floor-clamped loss, ReputationMgr.cpp:188-189,409-412,430-433)", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.setPendingFlag(BLOODSAIL, "atWar", false);
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
    store.setStanding({
      entries: [
        { repListId: BLOODSAIL, standing: -700 },
        { repListId: SILVERMOON, standing: 300 },
      ],
      increased: false,
    });
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
    expect((store.flagsOf(BLOODSAIL) ?? 0) & FACTION_FLAGS.AT_WAR).not.toBe(0);
  });

  test("a manual peace request after an inferred war keeps a later war declaration", async () => {
    const { seen, store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.setPendingFlag(BLOODSAIL, "atWar", false);
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
    expect((store.flagsOf(BLOODSAIL) ?? 0) & FACTION_FLAGS.AT_WAR).toBe(0);
    expect(seen.at(-1)).toMatchObject({ atWar: false, type: "flags_pending" });
    store.setPendingFlag(BLOODSAIL, "atWar", true);
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
    expect(store.flagsOf(BLOODSAIL)).toBe(FACTION_FLAGS.AT_WAR);
  });

  test("a manual war declaration after an inferred peace replaces the inference", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.setStanding(standing(BLOODSAIL, 0, true));
    expect(row(store, BLOODSAIL)?.atWar).toBe(false);
    store.setPendingFlag(BLOODSAIL, "atWar", true);
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
  });

  test("a manual toggle leaves the inference of other flags alone", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    store.setPendingFlag(BLOODSAIL, "inactive", true);
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
  });
});

describe("reputation store inferred at-war flags", () => {
  test("hostile standing keeps the inferred flag while at war", async () => {
    const { store } = await setup();
    store.setStanding(standing(BLOODSAIL, -700));
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
    store.setStanding(standing(BLOODSAIL, -800));
    expect(row(store, BLOODSAIL)?.atWar).toBe(true);
  });

  test("peace-forced factions never infer at war", async () => {
    const { store } = await setup();
    store.setStanding(standing(SILVERMOON, -9500));
    expect(row(store, SILVERMOON)?.atWar).toBe(false);
  });
});
