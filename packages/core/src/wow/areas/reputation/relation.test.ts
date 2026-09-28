import { describe, expect, test } from "bun:test";
import {
  BLOOD_ELF_MASK,
  MAGE_MASK,
  REPUTATION_FACTIONS,
  reputationDbcSource,
} from "#test-support/areas/reputation";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { testStores } from "#test-support/session-fixtures";
import { loadFactionCatalog } from "#wow/areas/reputation/catalog";
import { reputationRelationView } from "#wow/areas/reputation/relation";
import { ReputationStore } from "#wow/areas/reputation/store";
import { loadFactionTemplates } from "#wow/faction-template";
import type { SessionDeps } from "#wow/session-stores";
import { reputationReaction } from "#wow/unit-relation";

const SILVERMOON = 14;
const BLOODSAIL = 20;
const GUARD_TEMPLATE = 1604;
const PIRATE_TEMPLATE = 119;

const deps: SessionDeps = {
  getEntity: () => undefined,
  now: () => 0,
  selfGuid: () => 0x2an,
  send: () => undefined,
  updateEntity: () => undefined,
};

async function setup(options: { catalog?: boolean } = {}) {
  const store = new ReputationStore(deps, testStores(deps));
  if (options.catalog ?? true) {
    store.setCatalog(
      await loadFactionCatalog(reputationDbcSource(REPUTATION_FACTIONS)),
    );
    store.setCharacter(BLOOD_ELF_MASK, MAGE_MASK);
  }
  store.initialize({ entries: [] });
  return { store, view: reputationRelationView(store) };
}

async function templates() {
  const row = (id: number, faction: number) => {
    const cells = new Array<number>(14).fill(0);
    cells[0] = id;
    cells[1] = faction;
    return cells;
  };
  const file = packDbc(14, [
    row(GUARD_TEMPLATE, 911),
    row(PIRATE_TEMPLATE, 87),
  ]);
  return loadFactionTemplates(
    dbcFiles(new Map([["FactionTemplate.dbc", file]])),
  );
}

describe("reputation relation view", () => {
  test("answers forced ranks, reputation ranks and war by Faction.dbc id", async () => {
    const { store, view } = await setup();
    store.setForced({ reactions: [{ factionId: 87, rank: 4 }] });
    store.setStanding({
      entries: [{ repListId: BLOODSAIL, standing: -700 }],
      increased: false,
    });
    expect(view.forcedRank(87)).toBe(4);
    expect(view.forcedRank(911)).toBeUndefined();
    expect(view.reputationRank(911)).toBe(4);
    expect(view.reputationRank(87)).toBe(1);
    expect(view.reputationRank(589)).toBeUndefined();
    expect(view.atWar(87)).toBe(true);
    expect(view.atWar(911)).toBe(false);
  });

  test("gives a guard's reaction from the character's standing (Unit.cpp:6973-6984)", async () => {
    const { store, view } = await setup();
    const factions = await templates();
    expect(reputationReaction(view, factions, GUARD_TEMPLATE)).toBe(4);
    store.setStanding({
      entries: [{ repListId: SILVERMOON, standing: -10_000 }],
      increased: false,
    });
    expect(reputationReaction(view, factions, GUARD_TEMPLATE)).toBe(0);
    store.setForced({ reactions: [{ factionId: 911, rank: 5 }] });
    expect(reputationReaction(view, factions, GUARD_TEMPLATE)).toBe(5);
    expect(reputationReaction(view, factions, PIRATE_TEMPLATE)).toBe(2);
  });

  test("with no catalog only forced ranks answer", async () => {
    const { store, view } = await setup({ catalog: false });
    const factions = await templates();
    expect(reputationReaction(view, factions, GUARD_TEMPLATE)).toBeUndefined();
    store.setForced({ reactions: [{ factionId: 911, rank: 0 }] });
    expect(reputationReaction(view, factions, GUARD_TEMPLATE)).toBe(0);
  });
});
