import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  type LfgListGroupInit,
  type LfgListPlayerInit,
  lfgListBody,
} from "#test-support/areas/lfg";
import type { LfgEvent } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function setup(now: { at: number } = { at: 1000 }) {
  const rig = areaRig("lfg", { now: () => now.at });
  const seen: LfgEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen, now };
}

const group = (guid: bigint, comment: string): LfgListGroupInit => ({
  guid,
  comment,
  instanceGuid: 0n,
  encounterMask: 0,
});

const solo = (guid: bigint, comment: string): LfgListPlayerInit => ({
  guid,
  flags: 0x02 | 0x10 | 0x80,
  comment,
  roles: 2,
  instanceGuid: 0x70n,
  encounterMask: 1,
});

const DUNGEON = 0x2a;
const OTHER = 0x2b;

function guids(list: { guid: bigint }[] | readonly { guid: bigint }[]) {
  return list.map((entry) => entry.guid);
}

describe("LfgStore raid lists", () => {
  test("a full packet stores the lists under the dungeon and emits raid_list full", () => {
    const { rig, seen } = setup({ at: 4242 });
    try {
      expect(rig.handle.state().raidLists).toEqual({});
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({
          dungeon: DUNGEON,
          groups: [group(0x1000n, "kara")],
          players: [solo(0x11n, "dps")],
        }),
      );
      const list = rig.handle.state().raidLists[DUNGEON];
      expect(list?.dungeon).toBe(DUNGEON);
      expect(list?.at).toBe(4242);
      expect(guids(list?.groups ?? [])).toEqual([0x1000n]);
      expect(list?.groups[0]?.comment).toBe("kara");
      expect(list?.players[0]).toMatchObject({
        guid: 0x11n,
        comment: "dps",
        instance: { guid: 0x70n, encounterMask: 1 },
      });
      expect(seen).toEqual([
        { type: "raid_list", dungeon: DUNGEON, form: "full" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an empty full packet records an empty list so the search is known to have answered", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(GameOpcode.SMSG_UPDATE_LFG_LIST, lfgListBody({ dungeon: 9 }));
      expect(rig.handle.state().raidLists[9]).toMatchObject({
        dungeon: 9,
        groups: [],
        players: [],
      });
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a second full packet replaces the lists for that dungeon only", () => {
    const { rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({
          dungeon: DUNGEON,
          groups: [group(0x1000n, "old")],
          players: [solo(0x11n, "old")],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: OTHER, players: [solo(0x33n, "other")] }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON, players: [solo(0x22n, "new")] }),
      );
      const lists = rig.handle.state().raidLists;
      expect(guids(lists[DUNGEON]?.groups ?? [])).toEqual([]);
      expect(guids(lists[DUNGEON]?.players ?? [])).toEqual([0x22n]);
      expect(guids(lists[OTHER]?.players ?? [])).toEqual([0x33n]);
    } finally {
      rig.dispose();
    }
  });

  test("a difference packet deletes players and groups, replaces by guid, appends new ones", () => {
    const { rig, seen, now } = setup({ at: 1000 });
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({
          dungeon: DUNGEON,
          groups: [group(0x1000n, "a"), group(0x2000n, "b")],
          players: [solo(0x11n, "one"), solo(0x22n, "two"), solo(0x33n, "tre")],
        }),
      );
      now.at = 6000;
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({
          dungeon: DUNGEON,
          deleted: [0x1000n, 0x11n],
          groups: [group(0x2000n, "b2"), group(0x4000n, "d")],
          players: [solo(0x22n, "two2"), solo(0x44n, "four")],
        }),
      );
      const list = rig.handle.state().raidLists[DUNGEON];
      expect(list?.groups.map((g) => [g.guid, g.comment])).toEqual([
        [0x2000n, "b2"],
        [0x4000n, "d"],
      ]);
      expect(list?.players.map((p) => [p.guid, p.comment])).toEqual([
        [0x22n, "two2"],
        [0x33n, "tre"],
        [0x44n, "four"],
      ]);
      expect(list?.at).toBe(6000);
      expect(
        seen.map((e) => (e.type === "raid_list" ? e.form : e.type)),
      ).toEqual(["full", "difference"]);
    } finally {
      rig.dispose();
    }
  });

  test("a difference packet before any full list builds the list from nothing", () => {
    const { rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({
          dungeon: DUNGEON,
          deleted: [0x99n],
          players: [solo(0x11n, "one")],
        }),
      );
      expect(
        guids(rig.handle.state().raidLists[DUNGEON]?.players ?? []),
      ).toEqual([0x11n]);
    } finally {
      rig.dispose();
    }
  });

  test("state() returns copies the caller cannot use to change the store", () => {
    const { rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON, players: [solo(0x11n, "one")] }),
      );
      const first = rig.handle.state().raidLists[DUNGEON];
      (first?.players as unknown[]).length = 0;
      expect(
        guids(rig.handle.state().raidLists[DUNGEON]?.players ?? []),
      ).toEqual([0x11n]);
    } finally {
      rig.dispose();
    }
  });
});
