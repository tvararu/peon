import { describe, expect, test } from "bun:test";
import {
  BG_ME,
  battlegroundsInspectHonorStatsBody,
  battlegroundsPvpCreditBody,
  battlegroundsQuestUpdateAddPvpKillBody,
  battlegroundsScene,
  battlegroundsZoneUnderAttackBody,
} from "#test-support/areas/battlegrounds";
import type { BattlegroundsEvent } from "#wow/areas/battlegrounds/store";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("battlegrounds packets (Entities/Player/Player.cpp:6385-6392)", () => {
  test("SMSG_PVP_CREDIT appends to credits and emits honor_credit", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_PVP_CREDIT,
        battlegroundsPvpCreditBody({ honor: 100, rank: -1, victim: 0x0d_00n }),
      );
      expect(rig.handle.state().credits).toEqual([
        { honor: 100, rank: -1, victim: 0x0d_00n },
      ]);
      expect(seen.map((event) => event.type)).toContain("honor_credit");
    } finally {
      rig.dispose();
    }
  });

  test("MSG_INSPECT_HONOR_STATS sets inspect per guid and emits honor_inspect", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.MSG_INSPECT_HONOR_STATS,
        battlegroundsInspectHonorStatsBody({
          guid: BG_ME,
          honor: 12,
          kills: 3,
          lifetime: 44,
          today: 7,
          yesterday: 9,
        }),
      );
      expect(rig.handle.state().inspect.get(BG_ME)).toEqual({
        guid: BG_ME,
        honor: 12,
        kills: 3,
        lifetime: 44,
        today: 7,
        yesterday: 9,
      });
      expect(seen.map((event) => event.type)).toContain("honor_inspect");
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_ZONE_UNDER_ATTACK appends the alert and emits zone_under_attack", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_ZONE_UNDER_ATTACK,
        battlegroundsZoneUnderAttackBody({ areaId: 42 }),
      );
      expect(rig.handle.state().zoneAlerts).toEqual([{ areaId: 42, at: 0 }]);
      expect(seen.map((event) => event.type)).toContain("zone_under_attack");
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_QUESTUPDATE_ADD_PVP_KILL emits pvp_kill_quest", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_QUESTUPDATE_ADD_PVP_KILL,
        battlegroundsQuestUpdateAddPvpKillBody({
          count: 2,
          quest: 13233,
          required: 15,
        }),
      );
      expect(rig.handle.state().self.lifetimeKills).toBeUndefined();
      expect(seen.map((event) => event.type)).toContain("pvp_kill_quest");
    } finally {
      rig.dispose();
    }
  });

  test("self update fields fill self honor, arena points and kills", () => {
    const { rig, update } = battlegroundsScene();
    try {
      update(0x0b_00n, {
        arena: 500,
        honor: 900,
        kills: (4 << 16) | 3,
        lifetime: 44,
        today: 7,
        yesterday: 9,
      });
      expect(rig.handle.state().self).toMatchObject({
        arenaPoints: 500,
        honor: 900,
        killsToday: 3,
        killsYesterday: 4,
        lifetimeKills: 44,
      });
    } finally {
      rig.dispose();
    }
  });
});
