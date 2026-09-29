import { describe, expect, test } from "bun:test";
import { PartyStore } from "#wow/party-store";
import type { GroupList } from "#wow/protocol/group-list";

function list(names: string[], loot?: GroupList["loot"]): GroupList {
  return {
    counter: 1,
    dungeonId: undefined,
    dungeonStatus: undefined,
    groupGuidHigh: 0,
    groupGuidLow: 0x1_f4,
    leaderGuidHigh: 0,
    leaderGuidLow: 1,
    loot,
    members: names.map((name, i) => ({
      flags: 0,
      guidHigh: 0,
      guidLow: 0xa_40 + i,
      name,
      online: true,
      roles: 0,
      status: 1,
      subgroup: 0,
    })),
    ownFlags: 0,
    ownRoles: 0,
    ownSubgroup: 0,
    type: 0,
  };
}

const ROUND_ROBIN: GroupList["loot"] = {
  dungeonDifficulty: 0,
  heroic: false,
  looterGuidHigh: 0,
  looterGuidLow: 0,
  method: 1,
  raidDifficulty: 0,
  threshold: 2,
};

describe("party store", () => {
  test("reports joining, member changes and leaving", () => {
    const party = new PartyStore();
    expect(party.applyList(list(["Bob"], ROUND_ROBIN), "Xia")).toEqual({
      added: [],
      formed: true,
      removed: [],
    });
    expect(party.applyList(list(["Bob", "Cid"], ROUND_ROBIN), "Xia")).toEqual({
      added: ["Cid"],
      formed: false,
      removed: [],
    });
    expect(party.applyList(list([]), "")).toEqual({
      added: [],
      formed: false,
      removed: ["Bob", "Cid"],
    });
    expect(party.snapshot()).toMatchObject({
      counter: 1,
      difficulty: undefined,
      dungeonFinder: undefined,
      inGroup: false,
      kind: "party",
      leader: null,
      loot: null,
      members: [],
      ownFlags: 0,
      ownRoles: 0,
      ownSubgroup: 0,
    });
  });

  test("names the loot rule and keeps member stats until they leave", () => {
    const party = new PartyStore();
    party.applyList(list(["Bob"], ROUND_ROBIN), "Xia");
    party.applyStats(0xa40n, { hp: 152, level: 10, maxHp: 217 }, 1000);
    party.applyStats(0xa40n, { hp: 79 }, 2000);
    party.applyList(list(["Bob"], ROUND_ROBIN), "Xia");
    party.applyLeader("Bob");
    const state = party.snapshot();
    expect(state).toMatchObject({
      inGroup: true,
      kind: "party",
      leader: "Bob",
      loot: {
        masterLooter: null,
        method: "round_robin",
        threshold: "uncommon",
      },
      members: [
        { health: 79, level: 10, maxHealth: 217, name: "Bob", statsAt: 2000 },
      ],
    });
    party.applyList(list([]), "");
    party.applyList(list(["Bob"]), "Xia");
    expect(party.snapshot()).toMatchObject({
      inGroup: true,
      leader: "Xia",
      loot: null,
      members: [
        {
          flags: 0,
          guid: 0xa40n,
          health: null,
          level: null,
          maxHealth: null,
          name: "Bob",
          online: true,
          roles: 0,
          source: null,
          statsAt: null,
          status: 1,
          subgroup: 0,
        },
      ],
    });
  });

  test("reads the raid roster fields and the difficulties", () => {
    const party = new PartyStore();
    party.applyList(
      {
        ...list(["Bob"], {
          dungeonDifficulty: 1,
          heroic: false,
          looterGuidHigh: 0,
          looterGuidLow: 0,
          method: 3,
          raidDifficulty: 1,
          threshold: 2,
        }),
        dungeonId: undefined,
        dungeonStatus: undefined,
        members: [
          {
            flags: 1,
            guidHigh: 0,
            guidLow: 0xa_40,
            name: "Bob",
            online: true,
            roles: 2,
            status: 1,
            subgroup: 0,
          },
        ],
        ownFlags: 1,
        ownRoles: 2,
        ownSubgroup: 1,
        type: 2,
      },
      "Xia",
    );
    expect(party.snapshot()).toMatchObject({
      difficulty: { dungeon: 1, heroic: false, raid: 1 },
      kind: "raid",
      ownFlags: 1,
      ownRoles: 2,
      ownSubgroup: 1,
    });
    expect(party.snapshot().members[0]).toMatchObject({
      flags: 1,
      roles: 2,
      status: 1,
      subgroup: 0,
    });
  });

  test("reads a battleground raid group as a raid", () => {
    const party = new PartyStore();
    party.applyList({ ...list(["Bob"]), type: 3 }, "Bob");
    expect(party.snapshot().kind).toBe("raid");
  });

  test("reads the dungeon-finder form", () => {
    const party = new PartyStore();
    party.applyList(
      {
        ...list(["Bob"], ROUND_ROBIN),
        dungeonId: 33,
        dungeonStatus: 0,
        type: 8,
      },
      "Xia",
    );
    expect(party.snapshot()).toMatchObject({
      dungeonFinder: { dungeonId: 33, status: 0 },
    });
  });

  test("clears the state on the you-left form", () => {
    const party = new PartyStore();
    party.applyList(list(["Bob"], ROUND_ROBIN), "Xia");
    party.applyList(
      {
        ...list([]),
        loot: undefined,
        type: 16,
      },
      "",
    );
    expect(party.snapshot()).toMatchObject({ inGroup: false, members: [] });
  });

  test("prefers the observed unit while the member is in view", () => {
    const party = new PartyStore();
    party.applyList(list(["Bob"]), "Xia");
    party.applyStats(0xa40n, { hp: 200, level: 10, maxHp: 217 }, 1000);
    const unit = { health: 126, level: 10, maxHealth: 217 };
    const state = party.snapshot(
      (guid) => (guid === 0xa40n ? unit : undefined),
      4000,
    );
    expect(state.members[0]).toMatchObject({
      health: 126,
      source: "unit",
      statsAt: 4000,
    });
    expect(party.snapshot().members[0]).toMatchObject({
      health: 200,
      source: "party_stats",
    });
  });

  test("marks offline members and reports no group when alone", () => {
    const party = new PartyStore();
    expect(party.snapshot().inGroup).toBe(false);
    party.applyList(list(["Bob"]), "Xia");
    party.applyStats(0xa40n, { online: false }, 1000);
    expect(party.snapshot().members[0]?.online).toBe(false);
    party.clear();
    expect(party.snapshot().inGroup).toBe(false);
  });
});
