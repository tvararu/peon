import { describe, expect, test } from "bun:test";
import {
  lfgBootBody,
  lfgJoinResultBody,
  lfgOfferContinueBody,
  lfgPartyInfoBody,
  lfgPlayerInfoBody,
  lfgProposalBody,
  lfgQueueStatusBody,
  lfgRewardBody,
  lfgRoleCheckUpdateBody,
  lfgRoleChosenBody,
  lfgTeleportDeniedBody,
  lfgUpdatePartyBody,
  lfgUpdatePlayerBody,
} from "#test-support/areas/lfg";
import {
  buildLfgBootVote,
  buildLfgComment,
  buildLfgGetStatus,
  buildLfgJoin,
  buildLfgLeave,
  buildLfgProposalResult,
  buildLfgSetRoles,
  buildLfgTeleport,
  buildPartyLockInfoRequest,
  buildPlayerLockInfoRequest,
  dungeonEntry,
  parseBootProposal,
  parseLfgJoinResult,
  parseLfgPlayerInfo,
  parseLfgProposal,
  parseLfgQueueStatus,
  parseLfgReward,
  parseLfgUpdate,
  parseLockBlock,
  parseOfferContinue,
  parsePartyLockBlock,
  parseRoleCheckUpdate,
  parseRoleChosen,
  parseTeleportDenied,
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

  test("join result reads a bare result and state (LFGHandler.cpp:441-454)", () => {
    const body = lfgJoinResultBody({ result: 0 });
    expect(body).toHaveLength(8);
    expect(parseLfgJoinResult(reader(body))).toEqual({
      result: 0,
      state: 0,
      partyLocks: [],
    });
  });

  test("join result with locks reads a u8 player count, which wowm's smsg_lfg_join_result.wowm lacks", () => {
    const body = lfgJoinResultBody({
      result: 6,
      state: 3,
      partyLocks: [
        { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 2 }] },
        { guid: 0xbeen, locks: [] },
      ],
    });
    expect(parseLfgJoinResult(reader(body))).toEqual({
      result: 6,
      state: 3,
      partyLocks: [
        { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 2 }] },
        { guid: 0xbeen, locks: [] },
      ],
    });
  });

  test("queue status reads signed waits and the needed roles (LFGHandler.cpp:456-473)", () => {
    const body = lfgQueueStatusBody({
      dungeon: 0x01_00_00_12,
      avgWait: -1,
      wait: 61,
      waitTank: -1,
      waitHealer: 30,
      waitDps: 900,
      tanks: 1,
      healers: 0,
      dps: 3,
      queuedTime: 12,
    });
    expect(parseLfgQueueStatus(reader(body))).toEqual({
      dungeon: 0x01_00_00_12,
      avgWait: -1,
      wait: 61,
      waitTank: -1,
      waitHealer: 30,
      waitDps: 900,
      tanks: 1,
      healers: 0,
      dps: 3,
      queuedTime: 12,
    });
  });

  test("role check update reads state, dungeons and members leader first (LFGHandler.cpp:394-439)", () => {
    const body = lfgRoleCheckUpdateBody({
      state: 2,
      dungeons: [0x01_00_00_12],
      members: [
        { guid: 0xan, roles: 8, level: 20 },
        { guid: 0xbn, roles: 0, level: 19 },
      ],
    });
    expect(parseRoleCheckUpdate(reader(body))).toEqual({
      state: 2,
      initializing: true,
      dungeons: [0x01_00_00_12],
      members: [
        { guid: 0xan, ready: true, roles: 8, level: 20 },
        { guid: 0xbn, ready: false, roles: 0, level: 19 },
      ],
    });
  });

  test("role check update with no dungeons and no members parses empty", () => {
    const body = lfgRoleCheckUpdateBody({
      state: 5,
      dungeons: [],
      members: [],
    });
    expect(parseRoleCheckUpdate(reader(body))).toEqual({
      state: 5,
      initializing: false,
      dungeons: [],
      members: [],
    });
  });

  test("role chosen reads guid, ready and roles (LFGHandler.cpp:383-392)", () => {
    expect(
      parseRoleChosen(reader(lfgRoleChosenBody({ guid: 0xcn, roles: 2 }))),
    ).toEqual({ guid: 0xcn, ready: true, roles: 2 });
    expect(
      parseRoleChosen(reader(lfgRoleChosenBody({ guid: 0xcn, roles: 0 }))),
    ).toEqual({ guid: 0xcn, ready: false, roles: 0 });
  });

  test("join request writes roles, two flag bytes, entries, three needs and the comment (LFGPackets.cpp:20-34)", () => {
    const r = reader(
      buildLfgJoin({ roles: 8, entries: [0x06_00_01_06], comment: "" }),
    );
    expect(r.uint32LE()).toBe(8);
    expect(r.uint8()).toBe(0);
    expect(r.uint8()).toBe(0);
    expect(r.uint8()).toBe(1);
    expect(r.uint32LE()).toBe(0x06_00_01_06);
    expect(r.uint8()).toBe(3);
    expect([r.uint8(), r.uint8(), r.uint8()]).toEqual([0, 0, 0]);
    expect(r.cString()).toBe("");
    expect(r.remaining).toBe(0);
  });

  test("join request carries the comment and allows 50 entries but not 51 (LFGPackets.h:34)", () => {
    const entries = Array.from({ length: 50 }, (_, i) => i + 1);
    const r = reader(buildLfgJoin({ roles: 2, entries, comment: "hi" }));
    r.skip(6);
    expect(r.uint8()).toBe(50);
    expect(() =>
      buildLfgJoin({ roles: 2, entries: [...entries, 51], comment: "" }),
    ).toThrow();
  });

  test("leave, set roles and comment requests match the handlers (LFGHandler.cpp:78-131)", () => {
    expect(buildLfgLeave()).toEqual(new Uint8Array());
    expect(buildLfgSetRoles(8)).toEqual(new Uint8Array([8]));
    expect(reader(buildLfgComment("hi")).cString()).toBe("hi");
  });

  test("proposal update reads the dungeon, state, id and each member's flags (LFGHandler.cpp:545-611)", () => {
    const proposal = parseLfgProposal(
      reader(
        lfgProposalBody({
          dungeon: 0x06_00_01_02,
          state: 0,
          id: 77,
          encounters: 5,
          silent: true,
          players: [
            { role: 2, self: true, inDungeon: false, sameGroup: true },
            {
              role: 8,
              answered: true,
              accepted: true,
              sameGroup: false,
              inDungeon: true,
            },
          ],
        }),
      ),
    );
    expect(proposal).toEqual({
      dungeon: 0x06_00_01_02,
      state: 0,
      id: 77,
      encounters: 5,
      silent: true,
      players: [
        {
          role: 2,
          self: true,
          inDungeon: false,
          sameGroup: true,
          answered: false,
          accepted: false,
        },
        {
          role: 8,
          self: false,
          inDungeon: true,
          sameGroup: false,
          answered: true,
          accepted: true,
        },
      ],
    });
  });

  test("proposal update with no players still reads (LFGHandler.cpp:565-571)", () => {
    const body = lfgProposalBody({ dungeon: 1, state: 2, id: 3, players: [] });
    expect(parseLfgProposal(reader(body)).players).toEqual([]);
  });

  test("boot update reads the votes, the victim, the time left and the reason (LFGHandler.cpp:513-543)", () => {
    expect(
      parseBootProposal(
        reader(
          lfgBootBody({
            inProgress: true,
            didVote: true,
            agree: false,
            victim: 0xabcdn,
            votes: 2,
            agrees: 1,
            timeLeft: 118,
            reason: "afk",
          }),
        ),
      ),
    ).toEqual({
      inProgress: true,
      didVote: true,
      agree: false,
      victim: 0xabcdn,
      votes: 2,
      agrees: 1,
      timeLeft: 118,
      needed: 3,
      reason: "afk",
    });
  });

  test("reward reads items as id, display id, count where wow_messages QuestGiverReward puts count before display id; AzerothCore wins (LFGHandler.cpp:475-511)", () => {
    expect(
      parseLfgReward(
        reader(
          lfgRewardBody({
            randomDungeon: 0x06_00_00_02,
            dungeon: 0x01_00_00_10,
            done: true,
            money: 4321,
            xp: 900,
            items: [
              { itemId: 47_241, displayId: 9999, count: 2 },
              { itemId: 1, displayId: 2, count: 3 },
            ],
          }),
        ),
      ),
    ).toEqual({
      randomDungeon: 0x06_00_00_02,
      dungeon: 0x01_00_00_10,
      done: true,
      money: 4321,
      xp: 900,
      items: [
        { itemId: 47_241, displayId: 9999, count: 2 },
        { itemId: 1, displayId: 2, count: 3 },
      ],
    });
  });

  test("reward with no items reads an empty list", () => {
    const reward = parseLfgReward(
      reader(
        lfgRewardBody({
          randomDungeon: 1,
          dungeon: 2,
          money: 0,
          xp: 0,
          items: [],
        }),
      ),
    );
    expect(reward.items).toEqual([]);
    expect(reward.done).toBe(false);
  });

  test("teleport denied and offer continue each read one u32 (LFGHandler.cpp:628-642)", () => {
    expect(parseTeleportDenied(reader(lfgTeleportDeniedBody(6)))).toEqual({
      code: 6,
    });
    expect(
      parseOfferContinue(reader(lfgOfferContinueBody(0x01_00_00_10))),
    ).toEqual({ entry: 0x01_00_00_10 });
  });

  test("proposal result, teleport and boot vote requests match the handlers (LFGHandler.cpp:95-104,133-150)", () => {
    const result = reader(buildLfgProposalResult(77, true));
    expect(result.uint32LE()).toBe(77);
    expect(result.uint8()).toBe(1);
    expect(result.remaining).toBe(0);
    expect(buildLfgProposalResult(9, false)).toEqual(
      new Uint8Array([9, 0, 0, 0, 0]),
    );
    expect(buildLfgTeleport(true)).toEqual(new Uint8Array([1]));
    expect(buildLfgTeleport(false)).toEqual(new Uint8Array([0]));
    expect(buildLfgBootVote(false)).toEqual(new Uint8Array([0]));
    expect(buildLfgBootVote(true)).toEqual(new Uint8Array([1]));
  });
});
