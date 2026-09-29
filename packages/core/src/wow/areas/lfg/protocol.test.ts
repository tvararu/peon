import { describe, expect, test } from "bun:test";
import {
  lfgPartyInfoBody,
  lfgPlayerInfoBody,
  lfgUpdatePartyBody,
  lfgUpdatePlayerBody,
} from "#test-support/areas/lfg";
import {
  buildLfgGetStatus,
  buildPartyLockInfoRequest,
  buildPlayerLockInfoRequest,
  dungeonEntry,
  parseLfgPlayerInfo,
  parseLfgUpdate,
  parseLockBlock,
  parsePartyLockBlock,
} from "#wow/areas/lfg/protocol";
import { PacketReader } from "#wow/protocol/packet";

const reader = (body: Uint8Array) => new PacketReader(body);

describe("lfg protocol", () => {
  test("player update reads queued, dungeons and comment", () => {
    const body = lfgUpdatePlayerBody({
      updateType: 5,
      data: { queued: true, dungeons: [0x01_00_00_12], comment: "" },
    });
    const update = parseLfgUpdate(reader(body), "player");
    expect(update).toEqual({
      updateType: 5,
      dungeons: [0x01_00_00_12],
      comment: "",
      queued: true,
    });
    expect(reader(body).uint8()).toBe(5);
  });

  test("player update without data reports no queue and no selection", () => {
    const update = parseLfgUpdate(
      reader(lfgUpdatePlayerBody({ updateType: 0 })),
      "player",
    );
    expect(update).toEqual({
      updateType: 0,
      dungeons: [],
      comment: "",
      queued: false,
    });
  });

  test("party update skips 7 flag bytes, not wowm's 4 (LFGHandler.cpp:362-368)", () => {
    const body = lfgUpdatePartyBody({
      updateType: 14,
      data: { join: true, queued: true, dungeons: [0x01_00_00_12] },
    });
    const update = parseLfgUpdate(reader(body), "party");
    expect(update.joined).toBe(true);
    expect(update.queued).toBe(true);
    expect(update.dungeons).toEqual([0x01_00_00_12]);
    expect(reader(body).remaining).toBeGreaterThan(0);
  });

  test("player info reads two rewards and a u32 lock count, not wowm's u8", () => {
    const body = lfgPlayerInfoBody({
      random: [{ entry: 0x01_00_00_12 }, { entry: 0x01_00_00_1d }],
      locks: [{ entry: 0x01_00_00_12, status: 2 }],
    });
    const info = parseLfgPlayerInfo(reader(body));
    expect(info.random.map((d) => d.entry)).toEqual([
      0x01_00_00_12, 0x01_00_00_1d,
    ]);
    expect(info.locks).toEqual([{ entry: 0x01_00_00_12, status: 2 }]);
  });

  test("lock block is shared by player info, party info and the join result", () => {
    const body = lfgPartyInfoBody([
      { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 6 }] },
    ]);
    const players = parsePartyLockBlock(reader(body));
    expect(players).toEqual([
      { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 6 }] },
    ]);
    const empty = lfgPartyInfoBody([]);
    expect(parsePartyLockBlock(reader(empty))).toEqual([]);
  });

  test("empty lock block parses to no locks", () => {
    const info = parseLfgPlayerInfo(
      reader(lfgPlayerInfoBody({ random: [], locks: [] })),
    );
    expect(info).toEqual({ random: [], locks: [] });
    expect(parseLockBlock(reader(new Uint8Array([0, 0, 0, 0])))).toEqual([]);
  });

  test("dungeonEntry splits the id and the type (LFGHandler.cpp:66,174)", () => {
    expect(dungeonEntry(0x01_00_00_12)).toEqual({ id: 18, type: 1 });
  });

  test("status and lock requests are empty (LFGHandler.cpp:281-300)", () => {
    expect(buildLfgGetStatus()).toEqual(new Uint8Array());
    expect(buildPlayerLockInfoRequest()).toEqual(new Uint8Array());
    expect(buildPartyLockInfoRequest()).toEqual(new Uint8Array());
  });
});
