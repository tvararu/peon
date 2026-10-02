import { describe, expect, test } from "bun:test";
import {
  battlegroundsBattlefieldListBody,
  battlegroundsGroupJoinedBody,
  battlegroundsInspectHonorStatsBody,
  battlegroundsPvpCreditBody,
  battlegroundsQuestUpdateAddPvpKillBody,
  battlegroundsStatusBody,
  battlegroundsStatusNoneBody,
  battlegroundsZoneUnderAttackBody,
} from "#test-support/areas/battlegrounds";
import {
  buildInspectHonorStats,
  buildTogglePvp,
  parseInspectHonorStats,
  parsePvpCredit,
  parseQuestUpdateAddPvpKill,
  parseZoneUnderAttack,
} from "#wow/areas/battlegrounds/protocol";
import {
  buildBattlefieldList,
  buildBattlefieldPort,
  buildBattlemasterHello,
  buildBattlemasterJoin,
  groupJoinedName,
  parseBattlefieldList,
  parseBattlefieldStatus,
  parseGroupJoinedBattleground,
} from "#wow/areas/battlegrounds/protocol-queue";
import { PacketReader } from "#wow/protocol/packet";

describe("battlegrounds protocol (Handlers/MiscHandler.cpp:500-519,1019-1049)", () => {
  test("parsePvpCredit keeps a negative rank (Entities/Player/Player.cpp:6385-6392)", () => {
    const parsed = parsePvpCredit(
      new PacketReader(
        battlegroundsPvpCreditBody({
          honor: 100,
          rank: 0xff_ff_ff_ff,
          victim: 0x0d_00n,
        }),
      ),
    );
    expect(parsed).toEqual({ honor: 100, rank: -1, victim: 0x0d_00n });
  });

  test("parseInspectHonorStats reads guid, honor, kills, today, yesterday, lifetime", () => {
    const parsed = parseInspectHonorStats(
      new PacketReader(
        battlegroundsInspectHonorStatsBody({
          guid: 0x0b_00n,
          honor: 12,
          kills: 3,
          lifetime: 44,
          today: 7,
          yesterday: 9,
        }),
      ),
    );
    expect(parsed).toEqual({
      guid: 0x0b_00n,
      honor: 12,
      kills: 3,
      lifetime: 44,
      today: 7,
      yesterday: 9,
    });
  });

  test("parseZoneUnderAttack reads the area id (Entities/Creature/Creature.cpp:2870-2875)", () => {
    const parsed = parseZoneUnderAttack(
      new PacketReader(battlegroundsZoneUnderAttackBody({ areaId: 42 })),
    );
    expect(parsed).toEqual({ areaId: 42 });
  });

  test("parseQuestUpdateAddPvpKill reads quest, count, required (Server/Packets/QuestPackets.cpp:89-96)", () => {
    const parsed = parseQuestUpdateAddPvpKill(
      new PacketReader(
        battlegroundsQuestUpdateAddPvpKillBody({
          count: 2,
          quest: 13_233,
          required: 15,
        }),
      ),
    );
    expect(parsed).toEqual({ count: 2, quest: 13_233, required: 15 });
  });

  test("buildTogglePvp encodes on, off and the empty toggle", () => {
    expect([...buildTogglePvp(true)]).toEqual([1]);
    expect([...buildTogglePvp(false)]).toEqual([0]);
    expect([...buildTogglePvp()]).toEqual([]);
  });

  test("buildInspectHonorStats writes the target guid", () => {
    expect([...buildInspectHonorStats(0x0b_00n)]).toEqual([
      0, 11, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

const reader = (body: Uint8Array) => new PacketReader(body);

describe("battlegrounds queue packets (Battlegrounds/BattlegroundMgr.cpp:196-254,584-638)", () => {
  test("parseBattlefieldList reads instances and no random block", () => {
    const parsed = parseBattlefieldList(
      reader(
        battlegroundsBattlefieldListBody({
          bgType: 2,
          fromWhere: 1,
          guid: 0n,
          instances: [1, 2, 7],
          rewards: { lossHonor: 30, winArena: 0, winHonor: 90 },
        }),
      ),
    );
    expect(parsed).toEqual({
      bgType: 2,
      fromWhere: 1,
      guid: 0n,
      instances: [1, 2, 7],
      random: undefined,
      rewards: { hasWin: false, lossHonor: 30, winArena: 0, winHonor: 90 },
    });
  });

  test("parseBattlefieldList reads the random block that follows isRandom", () => {
    const parsed = parseBattlefieldList(
      reader(
        battlegroundsBattlefieldListBody({
          bgType: 32,
          fromWhere: 0,
          guid: 0x0b_00n,
          instances: [4],
          random: { hasWin: 1, lossHonor: 5, winArena: 6, winHonor: 7 },
          rewards: { hasWin: 1, lossHonor: 1, winArena: 2, winHonor: 3 },
        }),
      ),
    );
    expect(parsed.random).toEqual({
      hasWin: true,
      lossHonor: 5,
      winArena: 6,
      winHonor: 7,
    });
    expect(parsed.instances).toEqual([4]);
  });

  test("parseBattlefieldList reads the arena form as a lone zero with no instances", () => {
    const parsed = parseBattlefieldList(
      reader(
        battlegroundsBattlefieldListBody({ bgType: 6, fromWhere: 0, guid: 9n }),
      ),
    );
    expect(parsed).toMatchObject({ bgType: 6, guid: 9n, instances: [] });
  });

  test("parseBattlefieldStatus reads the 12-byte none form", () => {
    const body = battlegroundsStatusNoneBody(1);
    expect(body.length).toBe(12);
    expect(parseBattlefieldStatus(reader(body))).toEqual({
      kind: "none",
      slot: 1,
    });
  });

  test("parseBattlefieldStatus reads WAIT_QUEUE and keeps the raw arena fields", () => {
    const parsed = parseBattlefieldStatus(
      reader(
        battlegroundsStatusBody({
          arenaType: 2,
          avgWait: 61_000,
          bgType: 2,
          inQueue: 4000,
          instanceId: 3,
          isArena: 0x0e,
          maxLevel: 19,
          minLevel: 10,
          rated: 1,
          slot: 0,
          status: 1,
        }),
      ),
    );
    expect(parsed).toEqual({
      arenaType: 2,
      avgWaitMs: 61_000,
      bgType: 2,
      inQueueMs: 4000,
      instanceId: 3,
      isArena: 0x0e,
      kind: "queued",
      maxLevel: 19,
      minLevel: 10,
      rated: true,
      slot: 0,
      word: 0x1f_90,
    });
  });

  test("parseBattlefieldStatus reads WAIT_JOIN and IN_PROGRESS", () => {
    expect(
      parseBattlefieldStatus(
        reader(
          battlegroundsStatusBody({
            bgType: 2,
            mapId: 489,
            slot: 1,
            status: 2,
            timeToRemove: 120_000,
          }),
        ),
      ),
    ).toMatchObject({
      kind: "invited",
      mapId: 489,
      slot: 1,
      timeToRemoveMs: 120_000,
    });
    expect(
      parseBattlefieldStatus(
        reader(
          battlegroundsStatusBody({
            autoLeave: 0,
            bgType: 2,
            elapsed: 5000,
            faction: 1,
            mapId: 489,
            slot: 0,
            status: 3,
          }),
        ),
      ),
    ).toMatchObject({
      autoLeaveMs: 0,
      elapsedMs: 5000,
      faction: 1,
      kind: "active",
      mapId: 489,
    });
  });

  test("parseGroupJoinedBattleground reads positive and negative results and the guid of -11", () => {
    expect(
      parseGroupJoinedBattleground(reader(battlegroundsGroupJoinedBody(2))),
    ).toEqual({ guid: undefined, result: 2 });
    expect(
      parseGroupJoinedBattleground(reader(battlegroundsGroupJoinedBody(-1)))
        .result,
    ).toBe(-1);
    expect(
      parseGroupJoinedBattleground(
        reader(battlegroundsGroupJoinedBody(-11, 0x0c_00n)),
      ),
    ).toEqual({ guid: 0x0c_00n, result: -11 });
  });

  test("groupJoinedName names the SharedDefines.h errors and leaves success unnamed", () => {
    expect(groupJoinedName(2)).toBeUndefined();
    expect(groupJoinedName(-1)).toBe("none");
    expect(groupJoinedName(-2)).toBe("deserter");
    expect(groupJoinedName(-4)).toBe("too_many_queues");
    expect(groupJoinedName(-11)).toBe("join_timed_out");
    expect(groupJoinedName(0)).toBe("not_eligible");
    expect(groupJoinedName(-99)).toBe("error_-99");
  });

  test("request builders write the field order of the AzerothCore readers (Handlers/BattleGroundHandler.cpp:37-86,368-430)", () => {
    expect([...buildBattlemasterHello(0x0102n)]).toEqual([
      2, 1, 0, 0, 0, 0, 0, 0,
    ]);
    expect([...buildBattlefieldList(2, 1, 0)]).toEqual([2, 0, 0, 0, 1, 0]);
    expect([...buildBattlemasterJoin(0n, 2, 5, true)]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 1,
    ]);
    expect([...buildBattlefieldPort(0, 2, false)]).toEqual([
      0, 0, 2, 0, 0, 0, 0x90, 0x1f, 0,
    ]);
  });
});
