import { describe, expect, jest, test } from "bun:test";
import {
  BG_ME,
  BG_OTHER,
  battlegroundsJoinedLeftBody,
  battlegroundsPositionsBody,
  battlegroundsPvpLogBody,
  battlegroundsScene,
  battlegroundsSpiritTimeBody,
  battlegroundsStatusBody,
  battlegroundsStatusNoneBody,
} from "#test-support/areas/battlegrounds";
import type { BattlegroundsEvent } from "#wow/areas/battlegrounds/store";
import { GameOpcode } from "#wow/protocol/opcodes";

type Scene = {
  rig: Pick<
    ReturnType<typeof battlegroundsScene>["rig"],
    "dispose" | "handle" | "inject" | "sent" | "stores"
  >;
};

function injectStatus(
  scene: Scene,
  init: Parameters<typeof battlegroundsStatusBody>[0],
): void {
  scene.rig.inject(
    GameOpcode.SMSG_BATTLEFIELD_STATUS,
    battlegroundsStatusBody(init),
  );
}

function enterMatch(scene: Scene): void {
  scene.rig.stores.self.receive({
    position: { mapId: 489, orientation: 0, x: 0, y: 0, z: 0 },
    type: "new_world",
  });
  injectStatus(scene, { bgType: 2, mapId: 489, slot: 0, status: 3 });
}

describe("battlegrounds match store (Battlegrounds/Battleground.cpp:1195-1210)", () => {
  test("an active status on the current map opens current and emits bg_entered", () => {
    const scene = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    scene.rig.handle.onEvent((event) => seen.push(event));
    try {
      scene.rig.stores.self.receive({
        position: { mapId: 489, orientation: 0, x: 0, y: 0, z: 0 },
        type: "new_world",
      });
      injectStatus(scene, { bgType: 2, mapId: 489, slot: 0, status: 3 });
      expect(scene.rig.handle.state().match.current).toMatchObject({
        bgType: 2,
        mapId: 489,
      });
      expect(seen.map((event) => event.type)).toContain("bg_entered");
    } finally {
      scene.rig.dispose();
    }
  });

  test("an active status on another map leaves current untouched", () => {
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, { bgType: 2, mapId: 489, slot: 0, status: 3 });
      expect(scene.rig.handle.state().match.current).toBeUndefined();
    } finally {
      scene.rig.dispose();
    }
  });

  test("joined and left guids fill the roster and emit bg_player_joined/left", () => {
    const scene = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    scene.rig.handle.onEvent((event) => seen.push(event));
    try {
      enterMatch(scene);
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEGROUND_PLAYER_JOINED,
        battlegroundsJoinedLeftBody(BG_OTHER),
      );
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEGROUND_PLAYER_JOINED,
        battlegroundsJoinedLeftBody(BG_OTHER),
      );
      expect(scene.rig.handle.state().match.current?.roster).toEqual([
        BG_OTHER,
      ]);
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEGROUND_PLAYER_LEFT,
        battlegroundsJoinedLeftBody(BG_OTHER),
      );
      expect(scene.rig.handle.state().match.current?.roster).toEqual([]);
      expect(seen.map((event) => event.type)).toContain("bg_player_joined");
      expect(seen.map((event) => event.type)).toContain("bg_player_left");
    } finally {
      scene.rig.dispose();
    }
  });

  test("a log fills the score and emits bg_score with ended and winner", () => {
    const scene = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    scene.rig.handle.onEvent((event) => seen.push(event));
    try {
      enterMatch(scene);
      scene.rig.inject(
        GameOpcode.MSG_PVP_LOG_DATA,
        battlegroundsPvpLogBody({
          ended: true,
          players: [{ guid: BG_ME, objectives: [2, 0] }],
          winner: 1,
        }),
      );
      const current = scene.rig.handle.state().match.current;
      expect(current?.score?.ended).toBe(true);
      expect(current?.score?.winner).toBe(1);
      expect(seen.map((event) => event.type)).toContain("bg_score");
    } finally {
      scene.rig.dispose();
    }
  });

  test("positions fill the carriers and the spirit time sets the rez", () => {
    const scene = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    scene.rig.handle.onEvent((event) => seen.push(event));
    try {
      enterMatch(scene);
      scene.rig.inject(
        GameOpcode.MSG_BATTLEGROUND_PLAYER_POSITIONS,
        battlegroundsPositionsBody([{ guid: BG_ME, x: 1, y: 2 }]),
      );
      expect(
        scene.rig.handle.state().match.current?.carriers.map((row) => row.guid),
      ).toEqual([BG_ME]);
      scene.rig.inject(
        GameOpcode.SMSG_AREA_SPIRIT_HEALER_TIME,
        battlegroundsSpiritTimeBody({ guid: 0x0d_00n, ms: 29_500 }),
      );
      expect(scene.rig.handle.state().match.current?.rez).toEqual({
        guide: 0x0d_00n,
        nextAt: 29_500,
      });
      expect(scene.rig.handle.state().match.spirit).toEqual({
        guide: 0x0d_00n,
        nextAt: 29_500,
      });
      expect(seen.map((event) => event.type)).toContain("bg_carriers");
      expect(seen.map((event) => event.type)).toContain("bg_rez_time");
    } finally {
      scene.rig.dispose();
    }
  });

  test("a new_world to another map clears current and emits bg_left_match", () => {
    const scene = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    scene.rig.handle.onEvent((event) => seen.push(event));
    try {
      enterMatch(scene);
      scene.rig.stores.self.receive({
        position: { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 },
        type: "new_world",
      });
      expect(scene.rig.handle.state().match.current).toBeUndefined();
      expect(seen.map((event) => event.type)).toContain("bg_left_match");
    } finally {
      scene.rig.dispose();
    }
  });

  test("leaving the battlefield map clears a queued spirit countdown", () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      scene.rig.inject(
        GameOpcode.SMSG_AREA_SPIRIT_HEALER_TIME,
        battlegroundsSpiritTimeBody({ guid: 0x0d_00n, ms: 29_500 }),
      );
      expect(scene.rig.handle.state().match.spirit).toEqual({
        guide: 0x0d_00n,
        nextAt: 29_500,
      });
      scene.rig.stores.self.receive({
        position: { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 },
        type: "new_world",
      });
      expect(scene.rig.handle.state().match.current).toBeUndefined();
      expect(scene.rig.handle.state().match.spirit).toBeUndefined();
    } finally {
      scene.rig.dispose();
    }
  });
});

describe("battlegrounds match acts (Handlers/BattleGroundHandler.cpp:619-635,928-943)", () => {
  test("act.requestScore sends MSG_PVP_LOG_DATA and resolves on bg_score (3 s)", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const pending = scene.rig.handle.act.requestScore();
      expect(scene.rig.sent.at(-1)?.opcode).toBe(GameOpcode.MSG_PVP_LOG_DATA);
      scene.rig.inject(
        GameOpcode.MSG_PVP_LOG_DATA,
        battlegroundsPvpLogBody({ players: [{ guid: BG_ME }] }),
      );
      expect((await pending).players.map((row) => row.guid)).toEqual([BG_ME]);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.requestScore rejects timeout after 3 s of silence", async () => {
    jest.useFakeTimers();
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const pending = scene.rig.handle.act.requestScore();
      jest.advanceTimersByTime(3000);
      await expect(pending).rejects.toThrow("timeout");
    } finally {
      jest.useRealTimers();
      scene.rig.dispose();
    }
  });

  test("act.requestCarriers sends MSG_BATTLEGROUND_PLAYER_POSITIONS and resolves (3 s)", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const pending = scene.rig.handle.act.requestCarriers();
      expect(scene.rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.MSG_BATTLEGROUND_PLAYER_POSITIONS,
      );
      scene.rig.inject(
        GameOpcode.MSG_BATTLEGROUND_PLAYER_POSITIONS,
        battlegroundsPositionsBody([{ guid: BG_ME, x: 3, y: 4 }]),
      );
      expect((await pending).carriers.map((row) => row.guid)).toEqual([BG_ME]);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.leaveBattleground sends CMSG_LEAVE_BATTLEFIELD and resolves on none (10 s)", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const pending = scene.rig.handle.act.leaveBattleground();
      const sent = scene.rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_LEAVE_BATTLEFIELD);
      expect([...(sent?.body ?? [])]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusNoneBody(0),
      );
      expect(await pending).toEqual({ kind: "left" });
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.leaveBattleground rejects in_combat and not_in_battleground", async () => {
    const scene = battlegroundsScene();
    try {
      await expect(scene.rig.handle.act.leaveBattleground()).rejects.toThrow(
        "not_in_battleground",
      );
      expect(scene.rig.sent).toHaveLength(0);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.reportAfk sends and resolves on send with no reply", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEGROUND_PLAYER_JOINED,
        battlegroundsJoinedLeftBody(BG_OTHER),
      );
      const result = await scene.rig.handle.act.reportAfk(BG_OTHER);
      expect(result).toEqual({ kind: "reported" });
      const sent = scene.rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_REPORT_PVP_AFK);
      expect(sent?.body.length).toBe(8);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.reportAfk sends for a guid the roster never listed", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const result = await scene.rig.handle.act.reportAfk(BG_OTHER);
      expect(result).toEqual({ kind: "reported" });
      expect(scene.rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_REPORT_PVP_AFK,
      );
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.reportAfk rejects when not in a match", async () => {
    const scene = battlegroundsScene();
    try {
      await expect(scene.rig.handle.act.reportAfk(BG_OTHER)).rejects.toThrow(
        "not_in_battleground",
      );
      expect(scene.rig.sent).toHaveLength(0);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.queueSpiritGuide sends query and queue and resolves on bg_rez_time (3 s)", async () => {
    const scene = battlegroundsScene();
    try {
      enterMatch(scene);
      const pending = scene.rig.handle.act.queueSpiritGuide(0x0d_00n);
      const sent = scene.rig.sent.slice(-2);
      expect(sent.map((row) => row.opcode)).toEqual([
        GameOpcode.CMSG_AREA_SPIRIT_HEALER_QUERY,
        GameOpcode.CMSG_AREA_SPIRIT_HEALER_QUEUE,
      ]);
      scene.rig.inject(
        GameOpcode.SMSG_AREA_SPIRIT_HEALER_TIME,
        battlegroundsSpiritTimeBody({ guid: 0x0d_00n, ms: 5000 }),
      );
      expect(await pending).toEqual({ guid: 0x0d_00n, ms: 5000 });
    } finally {
      scene.rig.dispose();
    }
  });
});
