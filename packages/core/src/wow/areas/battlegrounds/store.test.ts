import { describe, expect, test } from "bun:test";
import {
  BG_ME,
  battlegroundsBattlefieldListBody,
  battlegroundsGroupJoinedBody,
  battlegroundsInspectHonorStatsBody,
  battlegroundsPvpCreditBody,
  battlegroundsQuestUpdateAddPvpKillBody,
  battlegroundsScene,
  battlegroundsStatusBody,
  battlegroundsStatusNoneBody,
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

  test("SMSG_QUESTUPDATE_ADD_PVP_KILL emits pvp_kill_quest with quest, count and required", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_QUESTUPDATE_ADD_PVP_KILL,
        battlegroundsQuestUpdateAddPvpKillBody({
          count: 2,
          quest: 13_233,
          required: 15,
        }),
      );
      expect(seen).toContainEqual({
        count: 2,
        quest: 13_233,
        required: 15,
        type: "pvp_kill_quest",
      });
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

describe("battlegrounds queue state (Battlegrounds/BattlegroundMgr.cpp:196-254,584-638)", () => {
  test("WAIT_QUEUE fills the slot with the receive time and emits bg_status", () => {
    let clock = 1000;
    const { rig } = battlegroundsScene(() => clock);
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      clock = 5000;
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusBody({
          avgWait: 61_000,
          bgType: 2,
          inQueue: 0,
          slot: 0,
          status: 1,
        }),
      );
      const slots = rig.handle.state().queue.slots;
      expect(slots[0]).toMatchObject({
        avgWaitMs: 61_000,
        bgType: 2,
        kind: "queued",
        receivedAt: 5000,
      });
      expect(slots[1]).toEqual({ kind: "none" });
      expect(seen).toContainEqual(
        expect.objectContaining({
          previous: "none",
          slot: 0,
          type: "bg_status",
        }),
      );
    } finally {
      rig.dispose();
    }
  });

  test("WAIT_JOIN sets expiresAt from now plus the time to remove and emits bg_invited", () => {
    const { rig } = battlegroundsScene(() => 10_000);
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusBody({
          bgType: 2,
          mapId: 489,
          slot: 1,
          status: 2,
          timeToRemove: 80_000,
        }),
      );
      expect(rig.handle.state().queue.slots[1]).toMatchObject({
        expiresAt: 90_000,
        kind: "invited",
        mapId: 489,
      });
      expect(seen).toContainEqual({
        bgType: 2,
        expiresAt: 90_000,
        mapId: 489,
        slot: 1,
        type: "bg_invited",
      });
    } finally {
      rig.dispose();
    }
  });

  test("IN_PROGRESS stores map, auto-leave, elapsed and faction", () => {
    const { rig } = battlegroundsScene();
    try {
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusBody({
          autoLeave: 0,
          bgType: 2,
          elapsed: 7000,
          faction: 1,
          mapId: 489,
          slot: 0,
          status: 3,
        }),
      );
      expect(rig.handle.state().queue.slots[0]).toMatchObject({
        autoLeaveMs: 0,
        elapsedMs: 7000,
        faction: 1,
        kind: "active",
        mapId: 489,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a none status clears only its slot and emits bg_left for a filled slot", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      for (const [slot, bgType] of [
        [0, 2],
        [1, 3],
      ] as const)
        rig.inject(
          GameOpcode.SMSG_BATTLEFIELD_STATUS,
          battlegroundsStatusBody({ bgType, slot, status: 1 }),
        );
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusNoneBody(0),
      );
      const slots = rig.handle.state().queue.slots;
      expect(slots[0]).toEqual({ kind: "none" });
      expect(slots[1]).toMatchObject({ bgType: 3, kind: "queued" });
      expect(seen.filter((event) => event.type === "bg_left")).toEqual([
        { bgType: 2, previous: "queued", slot: 0, type: "bg_left" },
      ]);
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusNoneBody(0),
      );
      expect(seen.filter((event) => event.type === "bg_left")).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a repeated WAIT_QUEUE refreshes the slot and reports the previous kind", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      for (const avgWait of [1000, 2000])
        rig.inject(
          GameOpcode.SMSG_BATTLEFIELD_STATUS,
          battlegroundsStatusBody({ avgWait, bgType: 2, slot: 0, status: 1 }),
        );
      expect(rig.handle.state().queue.slots[0]).toMatchObject({
        avgWaitMs: 2000,
      });
      expect(
        seen.flatMap((e) => (e.type === "bg_status" ? [e.previous] : [])),
      ).toEqual(["none", "queued"]);
    } finally {
      rig.dispose();
    }
  });

  test("a status for a slot past the queue limit still lands in its own slot", () => {
    const { rig } = battlegroundsScene();
    try {
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusBody({ bgType: 2, slot: 2, status: 3 }),
      );
      const slots = rig.handle.state().queue.slots;
      expect(slots).toHaveLength(3);
      expect(slots[2]).toMatchObject({ kind: "active" });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_BATTLEFIELD_LIST sets list and emits bg_list", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_LIST,
        battlegroundsBattlefieldListBody({
          bgType: 2,
          fromWhere: 0,
          guid: 0x0c_00n,
          instances: [1, 2],
        }),
      );
      expect(rig.handle.state().queue.list).toMatchObject({
        bgType: 2,
        guid: 0x0c_00n,
        instances: [1, 2],
      });
      expect(seen.map((event) => event.type)).toContain("bg_list");
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_GROUP_JOINED_BATTLEGROUND sets lastJoin and names the error", () => {
    const { rig } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND,
        battlegroundsGroupJoinedBody(-2),
      );
      expect(rig.handle.state().queue.lastJoin).toEqual({
        error: "deserter",
        guid: undefined,
        result: -2,
      });
      rig.inject(
        GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND,
        battlegroundsGroupJoinedBody(2),
      );
      expect(seen.filter((e) => e.type === "bg_join_result")).toEqual([
        {
          error: "deserter",
          guid: undefined,
          result: -2,
          type: "bg_join_result",
        },
        {
          error: undefined,
          guid: undefined,
          result: 2,
          type: "bg_join_result",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a snapshot slot array is a copy", () => {
    const { rig } = battlegroundsScene();
    try {
      const slots = rig.handle.state().queue.slots as unknown[];
      slots[0] = "mutated";
      expect(rig.handle.state().queue.slots[0]).toEqual({ kind: "none" });
    } finally {
      rig.dispose();
    }
  });
});
