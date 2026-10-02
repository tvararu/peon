import { describe, expect, test } from "bun:test";
import {
  type LfgListCharacterInit,
  lfgListBody,
} from "#test-support/areas/lfg";
import {
  buildSearchJoin,
  buildSearchLeave,
  parseLfgList,
} from "#wow/areas/lfg/protocol-list";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const reader = (body: Uint8Array) => new PacketReader(body);

const CHARACTER: LfgListCharacterInit = {
  level: 80,
  classId: 1,
  raceId: 1,
  talents: [0, 51, 20],
  armor: 9000,
  spellDamage: 1,
  spellHeal: 2,
  critMelee: 300,
  critRanged: 301,
  critSpell: 302,
  mp5: 12.5,
  mp5Combat: 6.25,
  attackPower: 5200,
  agility: 400,
  health: 30_000,
  mana: 0,
  online: true,
  avgItemLevel: 213.5,
  defense: 540,
  dodge: 100,
  block: 200,
  parry: 300,
  haste: 400,
  expertise: 500,
};

const LEADER_FLAGS = 0x01 | 0x02 | 0x04 | 0x08 | 0x10 | 0x20;
const SOLO_FLAGS = 0x01 | 0x02 | 0x10 | 0x20 | 0x80;

describe("lfg raid list protocol", () => {
  test("search join and leave are one u32 (Handlers/LFGHandler.cpp:265-279)", () => {
    expect(buildSearchJoin(0x02_00_00_10)).toEqual(
      new Uint8Array([0x10, 0, 0, 2]),
    );
    expect(buildSearchLeave(0x02_00_00_10)).toEqual(
      new Uint8Array([0x10, 0, 0, 2]),
    );
  });

  test("reads the empty full list the server sends for an unknown dungeon (LFGMgr.cpp:1048-1066)", () => {
    const w = new PacketWriter();
    w.uint32LE(2);
    w.uint32LE(0x12_34);
    w.uint8(0);
    for (let i = 0; i < 4; i++) w.uint32LE(0);
    const r = reader(w.finish());
    expect(parseLfgList(r)).toEqual({
      type: 2,
      dungeon: 0x12_34,
      difference: false,
      deleted: [],
      groups: [],
      players: [],
    });
    expect(r.remaining).toBe(0);
  });

  test("a full list with one group and two players keeps the instance part only for the flag 0x80 player (LFGMgr.cpp:1366-1388)", () => {
    const body = lfgListBody({
      dungeon: 0x2a,
      groups: [
        {
          guid: 0x1000_0000_0000_0001n,
          comment: "kara tonight",
          instanceGuid: 0x77n,
          encounterMask: 0b101,
        },
      ],
      players: [
        {
          guid: 0x11n,
          flags: LEADER_FLAGS,
          character: CHARACTER,
          comment: "",
          groupGuid: 0x1000_0000_0000_0001n,
          roles: 0x01,
          area: 3457,
        },
        {
          guid: 0x22n,
          flags: SOLO_FLAGS,
          character: { ...CHARACTER, level: 70 },
          comment: "looking",
          roles: 0x02,
          area: 3456,
          instanceGuid: 0x99n,
          encounterMask: 7,
        },
      ],
    });
    const r = reader(body);
    const list = parseLfgList(r);
    expect(r.remaining).toBe(0);
    expect(list.difference).toBe(false);
    expect(list.groups).toEqual([
      {
        guid: 0x1000_0000_0000_0001n,
        flags: 0x02 | 0x10 | 0x80,
        comment: "kara tonight",
        instance: { guid: 0x77n, encounterMask: 0b101 },
      },
    ]);
    expect(list.players).toHaveLength(2);
    expect(list.players[0]).toEqual({
      guid: 0x11n,
      flags: LEADER_FLAGS,
      character: CHARACTER,
      comment: "",
      leader: true,
      groupGuid: 0x1000_0000_0000_0001n,
      roles: 0x01,
      area: 3457,
      status: undefined,
      instance: undefined,
    });
    expect(list.players[1]).toEqual({
      guid: 0x22n,
      flags: SOLO_FLAGS,
      character: { ...CHARACTER, level: 70 },
      comment: "looking",
      leader: false,
      groupGuid: undefined,
      roles: 0x02,
      area: 3456,
      status: undefined,
      instance: { guid: 0x99n, encounterMask: 7 },
    });
  });

  test("reads the average item level as f32, not wowm's u32", () => {
    const list = parseLfgList(
      reader(
        lfgListBody({
          dungeon: 1,
          players: [
            {
              guid: 5n,
              flags: 0x01 | 0x80,
              character: { ...CHARACTER, avgItemLevel: 251.75 },
            },
          ],
        }),
      ),
    );
    expect(list.players[0]?.character?.avgItemLevel).toBe(251.75);
    expect(list.players[0]?.character?.defense).toBe(540);
  });

  test("a difference list has the u8 set to 1 and starts with the deleted guids, which wowm names PARTIAL = 0", () => {
    const body = lfgListBody({
      dungeon: 0x2a,
      deleted: [0x33n, 0x1000_0000_0000_0001n],
      players: [
        {
          guid: 0x44n,
          flags: 0x02 | 0x10 | 0x80,
          comment: "back",
          roles: 4,
          instanceGuid: 0x55n,
          encounterMask: 1,
        },
      ],
    });
    expect(body[8]).toBe(1);
    const r = reader(body);
    const list = parseLfgList(r);
    expect(r.remaining).toBe(0);
    expect(list.difference).toBe(true);
    expect(list.deleted).toEqual([0x33n, 0x1000_0000_0000_0001n]);
    expect(list.groups).toEqual([]);
    expect(list.players.map((p) => p.guid)).toEqual([0x44n]);
  });

  test("a difference list with one deleted guid and nothing else", () => {
    const list = parseLfgList(
      reader(lfgListBody({ dungeon: 9, deleted: [0x33n] })),
    );
    expect(list).toEqual({
      type: 2,
      dungeon: 9,
      difference: true,
      deleted: [0x33n],
      groups: [],
      players: [],
    });
  });

  test("a player with the STATUS flag reads the status byte before the instance part", () => {
    const list = parseLfgList(
      reader(
        lfgListBody({
          dungeon: 1,
          players: [
            {
              guid: 5n,
              flags: 0x40 | 0x80,
              status: 9,
              instanceGuid: 0x66n,
              encounterMask: 3,
            },
            { guid: 6n, flags: 0x10, roles: 8 },
          ],
        }),
      ),
    );
    expect(list.players[0]?.status).toBe(9);
    expect(list.players[0]?.instance).toEqual({
      guid: 0x66n,
      encounterMask: 3,
    });
    expect(list.players[1]).toMatchObject({ guid: 6n, roles: 8 });
  });
});
