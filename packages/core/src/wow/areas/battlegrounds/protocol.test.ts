import { describe, expect, test } from "bun:test";
import { PacketReader } from "#wow/protocol/packet";
import {
  battlegroundsInspectHonorStatsBody,
  battlegroundsPvpCreditBody,
  battlegroundsQuestUpdateAddPvpKillBody,
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

describe("battlegrounds protocol (Handlers/MiscHandler.cpp:500-519,1019-1049)", () => {
  test("parsePvpCredit keeps a negative rank (Entities/Player/Player.cpp:6385-6392)", () => {
    const parsed = parsePvpCredit(
      new PacketReader(
        battlegroundsPvpCreditBody({
          honor: 100,
          rank: 0xffff_ffff,
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
          quest: 13233,
          required: 15,
        }),
      ),
    );
    expect(parsed).toEqual({ count: 2, quest: 13233, required: 15 });
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
