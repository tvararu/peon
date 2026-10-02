import { describe, expect, test } from "bun:test";
import {
  reputationInitializeFactionsBody,
  reputationSetFactionStandingBody,
  reputationSetFactionVisibleBody,
  reputationSetForcedReactionsBody,
} from "#test-support/areas/reputation";
import {
  buildSetFactionAtWar,
  buildSetFactionInactive,
  buildSetWatchedFaction,
  parseInitializeFactions,
  parseSetFactionStanding,
  parseSetFactionVisible,
  parseSetForcedReactions,
} from "#wow/areas/reputation/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("reputation parsers", () => {
  test("SMSG_INITIALIZE_FACTIONS reads 128 slots by list id with signed standings (ReputationMgr.cpp:211-245)", () => {
    const body = reputationInitializeFactionsBody(
      new Map([
        [0, { flags: 0x11, standing: 250 }],
        [14, { flags: 0x03, standing: -500 }],
        [127, { flags: 0x01, standing: 42_999 }],
      ]),
    );
    const { entries } = parseInitializeFactions(new PacketReader(body));
    expect(entries).toHaveLength(128);
    expect(entries[0]).toEqual({ flags: 0x11, standing: 250 });
    expect(entries[14]).toEqual({ flags: 0x03, standing: -500 });
    expect(entries[127]).toEqual({ flags: 0x01, standing: 42_999 });
    expect(entries[1]).toEqual({ flags: 0, standing: 0 });
  });

  test("SMSG_INITIALIZE_FACTIONS reads as many slots as its count says", () => {
    const body = reputationInitializeFactionsBody(
      new Map([[1, { flags: 0x01, standing: 7 }]]),
      2,
    );
    expect(body.byteLength).toBe(14);
    expect(parseInitializeFactions(new PacketReader(body))).toEqual({
      entries: [
        { flags: 0, standing: 0 },
        { flags: 0x01, standing: 7 },
      ],
    });
  });

  test("SMSG_SET_FACTION_STANDING reads u32 list ids and deltas after the increased byte (ReputationMgr.cpp:178-209)", () => {
    const body = reputationSetFactionStandingBody({
      entries: [
        { repListId: 14, standing: 25 },
        { repListId: 67, standing: -3000 },
      ],
      increased: true,
    });
    expect(parseSetFactionStanding(new PacketReader(body))).toEqual({
      increased: true,
      entries: [
        { repListId: 14, standing: 25 },
        { repListId: 67, standing: -3000 },
      ],
    });
  });

  test("SMSG_SET_FACTION_STANDING refuses wowm's 6-byte u16 faction entries", () => {
    const w = new PacketWriter();
    w.floatLE(0);
    w.uint8(0);
    w.uint32LE(2);
    for (const [faction, standing] of [
      [911, 25],
      [76, 10],
    ] as const) {
      w.uint16LE(faction);
      w.uint32LE(standing);
    }
    expect(() =>
      parseSetFactionStanding(new PacketReader(w.finish())),
    ).toThrow();
  });

  test("SMSG_SET_FACTION_VISIBLE reads a u32 list id (ReputationMgr.cpp:252-261)", () => {
    const body = reputationSetFactionVisibleBody(67);
    expect(parseSetFactionVisible(new PacketReader(body))).toEqual({
      repListId: 67,
    });
  });

  test("SMSG_SET_FORCED_REACTIONS reads an empty list (ReputationMgr.cpp:165-176)", () => {
    const body = reputationSetForcedReactionsBody([]);
    expect(body.byteLength).toBe(4);
    expect(parseSetForcedReactions(new PacketReader(body))).toEqual({
      reactions: [],
    });
  });

  test("SMSG_SET_FORCED_REACTIONS reads u32 Faction.dbc ids and u32 ranks in 8-byte entries (ReputationMgr.cpp:167-173)", () => {
    const body = reputationSetForcedReactionsBody([
      { factionId: 1015, rank: 4 },
      { factionId: 70_000, rank: 0 },
    ]);
    expect(body.byteLength).toBe(20);
    expect(parseSetForcedReactions(new PacketReader(body))).toEqual({
      reactions: [
        { factionId: 1015, rank: 4 },
        { factionId: 70_000, rank: 0 },
      ],
    });
  });

  test("SMSG_SET_FORCED_REACTIONS refuses wowm's 6-byte u16 faction entries", () => {
    const w = new PacketWriter();
    w.uint32LE(2);
    for (const [faction, rank] of [
      [1015, 4],
      [76, 0],
    ] as const) {
      w.uint16LE(faction);
      w.uint32LE(rank);
    }
    expect(() =>
      parseSetForcedReactions(new PacketReader(w.finish())),
    ).toThrow();
  });
});

describe("reputation builders", () => {
  test("CMSG_SET_FACTION_ATWAR is a u32 list id and a u8 flag (CharacterHandler.cpp:1287-1296)", () => {
    expect([...buildSetFactionAtWar(7, true)]).toEqual([7, 0, 0, 0, 1]);
    expect([...buildSetFactionAtWar(0, false)]).toEqual([0, 0, 0, 0, 0]);
  });

  test("CMSG_SET_FACTION_INACTIVE is a u32 list id and a u8 flag (CharacterHandler.cpp:1340-1347)", () => {
    expect([...buildSetFactionInactive(55, true)]).toEqual([55, 0, 0, 0, 1]);
    expect([...buildSetFactionInactive(55, false)]).toEqual([55, 0, 0, 0, 0]);
  });

  test("CMSG_SET_WATCHED_FACTION is a u32 list id and 0xFFFFFFFF is none (CharacterHandler.cpp:1333-1338, Player.cpp:549)", () => {
    expect([...buildSetWatchedFaction(14)]).toEqual([14, 0, 0, 0]);
    expect([...buildSetWatchedFaction(undefined)]).toEqual([
      0xff, 0xff, 0xff, 0xff,
    ]);
  });
});
