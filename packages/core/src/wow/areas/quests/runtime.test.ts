import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsQueryQuestsCompletedResponseBody,
  questsQuestgiverStatusMultipleBody,
  questsQuestPoiQueryResponseBody,
} from "#test-support/areas/quests";
import { REPLY_TIMEOUT_MS } from "#wow/areas/quests/runtime";
import { COMPLETED_QUERY_TIMEOUT_MS } from "#wow/areas/quests/runtime-log";
import type {
  EntityEvent,
  GameObjectEntity,
  UnitEntity,
} from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { QuestEvent } from "#wow/quests";
import { QUEST_REPLY_TIMEOUT_MS } from "#wow/quests-requests";

const ERONA = 0xf1_30_00_3f_d1_00_1a_2bn;
const JESSE = 0xf1_30_00_3e_a7_00_1a_30n;
const CHEST = 0xf1_10_00_00_2c_00_00_07n;
const PLAYER = 0x2bn;

function unit(
  guid: bigint,
  npcFlags: number,
  objectType:
    | typeof ObjectType.UNIT
    | typeof ObjectType.PLAYER = ObjectType.UNIT,
): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 15_297,
    factionTemplate: 1604,
    gender: 1,
    guid,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Magistrix Erona",
    npcFlags,
    objectType,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function gameObject(
  guid: bigint,
  bytes1: number,
  gameObjectType = 0,
): GameObjectEntity {
  return {
    bytes1,
    displayId: 1,
    entry: 180_000,
    flags: 0,
    gameObjectType,
    guid,
    name: undefined,
    objectType: ObjectType.GAMEOBJECT,
    position: undefined,
    rawFields: new Map(),
    scale: 1,
  };
}

function withRig(run: (r: ReturnType<typeof setup>) => void) {
  jest.useFakeTimers();
  const r = setup();
  try {
    run(r);
  } finally {
    r.rig.dispose();
    jest.useRealTimers();
  }
}

function setup() {
  const rig = areaRig("quests");
  const multiples = () =>
    rig.sent.filter(
      (p) => p.opcode === GameOpcode.CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY,
    );
  const singles = () =>
    rig.sent.filter(
      (p) => p.opcode === GameOpcode.CMSG_QUESTGIVER_STATUS_QUERY,
    );
  const entity = (event: EntityEvent) => rig.events.entity.emit(event);
  const quest = (type: QuestEvent["type"]) =>
    rig.events.quest.emit({
      questId: 8325,
      source: "packet",
      state: rig.stores.quests.state(),
      type,
    });
  const tick = (ms: number) => jest.advanceTimersByTime(ms);
  return { entity, multiples, quest, rig, singles, tick };
}

describe("quests runtime", () => {
  test("a quest giver coming into view sends one multiple query, 500 ms after the last trigger", () => {
    withRig(({ entity, multiples, tick }) => {
      entity({ entity: unit(ERONA, 0x3), type: "appear" });
      tick(300);
      entity({ entity: unit(JESSE, 0x2), type: "appear" });
      tick(499);
      expect(multiples()).toEqual([]);
      tick(1);
      expect(multiples()).toEqual([
        {
          body: new Uint8Array(),
          opcode: GameOpcode.CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY,
        },
      ]);
    });
  });

  test("the multiple query goes out at most once every 2 s", () => {
    withRig(({ entity, multiples, tick }) => {
      entity({ entity: unit(ERONA, 0x2), type: "appear" });
      tick(500);
      entity({ entity: unit(JESSE, 0x2), type: "appear" });
      tick(1999);
      expect(multiples()).toHaveLength(1);
      tick(1);
      expect(multiples()).toHaveLength(2);
      tick(10_000);
      expect(multiples()).toHaveLength(2);
    });
  });

  test("a quest-giver object, by its type byte or its queried type, also triggers the query", () => {
    withRig(({ entity, multiples, tick }) => {
      entity({ entity: gameObject(CHEST, 2 << 8), type: "appear" });
      tick(500);
      expect(multiples()).toHaveLength(1);
      tick(2000);
      entity({ entity: gameObject(JESSE, 0), type: "appear" });
      tick(500);
      expect(multiples()).toHaveLength(1);
      entity({
        changed: ["gameObjectType"],
        entity: gameObject(JESSE, 0, 2),
        type: "update",
      });
      tick(500);
      expect(multiples()).toHaveLength(2);
    });
  });

  test("no query for a unit without the giver flag, a player, or a giver that has a mark", () => {
    withRig(({ entity, multiples, rig, tick }) => {
      rig.inject(
        GameOpcode.SMSG_QUESTGIVER_STATUS_MULTIPLE,
        questsQuestgiverStatusMultipleBody([{ guid: ERONA, status: 8 }]),
      );
      entity({ entity: unit(ERONA, 0x2), type: "appear" });
      entity({ entity: unit(JESSE, 0x1), type: "appear" });
      entity({
        entity: unit(PLAYER, 0x2, ObjectType.PLAYER),
        type: "appear",
      });
      tick(5000);
      expect(multiples()).toEqual([]);
    });
  });

  test("an update that adds the giver flag triggers the query; other updates do not", () => {
    withRig(({ entity, multiples, tick }) => {
      entity({ entity: unit(JESSE, 0x1), type: "appear" });
      entity({ changed: ["health"], entity: unit(JESSE, 0x1), type: "update" });
      entity({
        changed: ["npcFlags"],
        entity: unit(JESSE, 0x1),
        type: "update",
      });
      tick(5000);
      expect(multiples()).toEqual([]);
      entity({
        changed: ["npcFlags"],
        entity: unit(JESSE, 0x3),
        type: "update",
      });
      tick(500);
      expect(multiples()).toHaveLength(1);
      tick(2000);
      entity({
        changed: ["npcFlags"],
        entity: unit(JESSE, 0x3),
        type: "update",
      });
      tick(5000);
      expect(multiples()).toHaveLength(1);
    });
  });

  test("accepted, removed, completed and failed quest events trigger the query", () => {
    withRig(({ multiples, quest, tick }) => {
      for (const type of [
        "accepted",
        "removed",
        "completed",
        "failed",
      ] as const) {
        quest(type);
        tick(2500);
      }
      expect(multiples()).toHaveLength(4);
      for (const type of ["progress", "dialog", "rewarded"] as const) {
        quest(type);
        tick(2500);
      }
      expect(multiples()).toHaveLength(4);
    });
  });

  test("a giver leaving view loses its mark", () => {
    withRig(({ entity, rig }) => {
      rig.inject(
        GameOpcode.SMSG_QUESTGIVER_STATUS_MULTIPLE,
        questsQuestgiverStatusMultipleBody([
          { guid: ERONA, status: 8 },
          { guid: JESSE, status: 5 },
        ]),
      );
      entity({ guid: ERONA, type: "disappear" });
      expect([...rig.handle.state().marks.keys()]).toEqual([JESSE]);
    });
  });

  test("queryGiverStatus sends the single query only for a known creature or object", () => {
    withRig(({ entity, rig, singles }) => {
      entity({ entity: unit(ERONA, 0x2), type: "appear" });
      entity({ entity: gameObject(CHEST, 0), type: "appear" });
      entity({
        entity: unit(PLAYER, 0x2, ObjectType.PLAYER),
        type: "appear",
      });
      expect(rig.handle.act.queryGiverStatus(PLAYER)).toBe(false);
      expect(rig.handle.act.queryGiverStatus(JESSE)).toBe(false);
      expect(rig.handle.act.queryGiverStatus(ERONA)).toBe(true);
      expect(rig.handle.act.queryGiverStatus(CHEST)).toBe(true);
      entity({ guid: ERONA, type: "disappear" });
      expect(rig.handle.act.queryGiverStatus(ERONA)).toBe(false);
      expect(singles().map((p) => new PacketReader(p.body).uint64LE())).toEqual(
        [ERONA, CHEST],
      );
      expect(singles().every((p) => p.body.length === 8)).toBe(true);
    });
  });

  test("queryGiverStatuses sends the multiple query at once", () => {
    withRig(({ multiples, rig }) => {
      rig.handle.act.queryGiverStatuses();
      expect(multiples()).toHaveLength(1);
    });
  });

  test("dispose drops a pending query", () => {
    jest.useFakeTimers();
    const { entity, multiples, rig, tick } = setup();
    try {
      entity({ entity: unit(ERONA, 0x2), type: "appear" });
      rig.dispose();
      tick(5000);
      expect(multiples()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("an accepted quest event queries its POIs at once", () => {
    withRig(({ quest, rig, tick }) => {
      quest("accepted");
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_QUEST_POI_QUERY,
      );
      expect(sent).toHaveLength(1);
      expect(
        new PacketReader(sent[0]?.body ?? new Uint8Array()).uint32LE(),
      ).toBe(1);
      expect(rig.handle.state().pois.get(8325)?.status).toBe("pending");
      tick(6000);
      expect(rig.handle.state().pois.get(8325)?.status).toBe("no_reply");
    });
  });

  test("queryPoi returns the known entries and refreshes a no_reply id once more", () => {
    withRig(({ quest, rig, tick }) => {
      quest("accepted");
      tick(6000);
      const before = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_QUEST_POI_QUERY,
      ).length;
      expect(rig.handle.act.queryPoi([8325])).toEqual([]);
      const after = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_QUEST_POI_QUERY,
      ).length;
      expect(after).toBe(before + 1);
      rig.inject(
        GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE,
        questsQuestPoiQueryResponseBody([{ questId: 8325, pois: [] }]),
      );
      expect(rig.stores.areas.quests.poiOf([8325])).toEqual([
        { questId: 8325, status: "none", pois: [] },
      ]);
    });
  });

  const poiQueries = (rig: ReturnType<typeof setup>["rig"]) =>
    rig.sent
      .filter((p) => p.opcode === GameOpcode.CMSG_QUEST_POI_QUERY)
      .map((p) => {
        const reader = new PacketReader(p.body ?? new Uint8Array());
        const count = reader.uint32LE();
        return Array.from({ length: count }, () => reader.uint32LE());
      });

  const withLog = (
    rig: ReturnType<typeof setup>["rig"],
    questIds: readonly number[],
  ) => {
    const state = rig.stores.quests.state();
    jest.spyOn(rig.stores.quests, "snapshot").mockReturnValue({
      ...state,
      log: {
        complete: true,
        slots: questIds.map((questId, slot) => ({
          slot,
          questId,
          flags: 0,
          counters: [0, 0, 0, 0],
          expiresAtSeconds: 0,
        })),
      },
    });
  };

  const known8325 = () =>
    questsQuestPoiQueryResponseBody([
      {
        questId: 8325,
        pois: [
          {
            poiId: 1,
            objectiveIndex: -1,
            mapId: 530,
            areaId: 462,
            floorId: 0,
            unk3: 1,
            unk4: 0,
            points: [{ x: 10_319, y: -6383 }],
          },
        ],
      },
    ]);

  test("a log change queries only new and no_reply quests, never empty slots", () => {
    withRig(({ quest, rig, tick }) => {
      quest("accepted");
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, known8325());
      withLog(rig, [8325, 0, 9999]);
      quest("log");
      quest("log");
      expect(poiQueries(rig)).toEqual([[8325], [9999]]);
      expect(rig.handle.state().pois.get(8325)?.status).toBe("known");
      tick(6000);
      quest("log");
      expect(poiQueries(rig)).toEqual([[8325], [9999], [9999]]);
    });
  });

  test("an accepted quest then its log change sends one query", () => {
    withRig(({ quest, rig }) => {
      withLog(rig, [8325]);
      quest("accepted");
      quest("log");
      expect(poiQueries(rig)).toEqual([[8325]]);
    });
  });

  test("queryPoi returns a known entry without querying it again", () => {
    withRig(({ quest, rig }) => {
      quest("accepted");
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, known8325());
      const [entry] = rig.handle.act.queryPoi([8325]);
      expect(entry?.status).toBe("known");
      expect(entry?.pois[0]?.objectiveIndex).toBe(-1);
      expect(poiQueries(rig)).toEqual([[8325]]);
    });
  });

  test("a quest answered with no POIs before acceptance is queried again on accept", () => {
    withRig(({ quest, rig }) => {
      rig.handle.act.queryPoi([8325]);
      rig.inject(
        GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE,
        questsQuestPoiQueryResponseBody([{ questId: 8325, pois: [] }]),
      );
      quest("accepted");
      expect(poiQueries(rig)).toEqual([[8325], [8325]]);
      expect(rig.handle.state().pois.get(8325)?.status).toBe("pending");
    });
  });

  test("a none quest is queried again only when it first appears in the log", () => {
    withRig(({ quest, rig }) => {
      rig.handle.act.queryPoi([9999]);
      const none9999 = questsQuestPoiQueryResponseBody([
        { questId: 9999, pois: [] },
      ]);
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, none9999);
      withLog(rig, [9999]);
      quest("log");
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, none9999);
      quest("log");
      expect(poiQueries(rig)).toEqual([[9999], [9999]]);
      withLog(rig, []);
      quest("log");
      withLog(rig, [9999]);
      quest("log");
      expect(poiQueries(rig)).toEqual([[9999], [9999], [9999]]);
    });
  });
  test("the timeout equals QUEST_REPLY_TIMEOUT_MS", () => {
    expect(REPLY_TIMEOUT_MS).toBe(QUEST_REPLY_TIMEOUT_MS);
  });
});

const HOME = { mapId: 530, x: 1, y: 2, z: 3, orientation: 0 };

function completedQueries(rig: ReturnType<typeof areaRig>) {
  return rig.sent.filter(
    (p) => p.opcode === GameOpcode.CMSG_QUERY_QUESTS_COMPLETED,
  );
}

function replyCompleted(rig: ReturnType<typeof areaRig>, ids: number[]) {
  rig.inject(
    GameOpcode.SMSG_QUERY_QUESTS_COMPLETED_RESPONSE,
    questsQueryQuestsCompletedResponseBody(ids),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("quests log extras runtime", () => {
  test("login_verified sends one empty CMSG_QUERY_QUESTS_COMPLETED; a new world does not", () => {
    withRig(({ rig }) => {
      rig.stores.self.receive({ type: "login_verified", position: HOME });
      rig.stores.self.receive({ type: "new_world", position: HOME });
      expect(completedQueries(rig)).toEqual([
        {
          body: new Uint8Array(),
          opcode: GameOpcode.CMSG_QUERY_QUESTS_COMPLETED,
        },
      ]);
    });
  });

  test("queryCompleted refuses while a query waits for its reply", async () => {
    jest.useFakeTimers();
    const rig = areaRig("quests");
    try {
      expect(rig.handle.act.queryCompleted()).toBe(true);
      expect(rig.handle.act.queryCompleted()).toBe(false);
      replyCompleted(rig, [8325]);
      await flush();
      expect(rig.handle.act.queryCompleted()).toBe(true);
      jest.advanceTimersByTime(COMPLETED_QUERY_TIMEOUT_MS - 1);
      await flush();
      expect(rig.handle.act.queryCompleted()).toBe(false);
      jest.advanceTimersByTime(1);
      await flush();
      expect(rig.handle.act.queryCompleted()).toBe(true);
      expect(completedQueries(rig)).toHaveLength(3);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a rewarded quest joins the completed ids", () => {
    withRig(({ quest, rig }) => {
      replyCompleted(rig, [8324]);
      quest("rewarded");
      expect(rig.handle.state().completed?.ids).toEqual(new Set([8324, 8325]));
    });
  });

  test("questgiverHello, autoLaunch and swapLogSlots send their packets", () => {
    withRig(({ rig }) => {
      rig.handle.act.questgiverHello(ERONA);
      rig.handle.act.autoLaunch();
      expect(rig.handle.act.swapLogSlots(0, 1)).toBe(true);
      expect(rig.handle.act.swapLogSlots(1, 1)).toBe(false);
      expect(rig.handle.act.swapLogSlots(0, 25)).toBe(false);
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array([
            0x2b, 0x1a, 0x00, 0xd1, 0x3f, 0x00, 0x30, 0xf1,
          ]),
          opcode: GameOpcode.CMSG_QUESTGIVER_HELLO,
        },
        {
          body: new Uint8Array(),
          opcode: GameOpcode.CMSG_QUESTGIVER_QUEST_AUTOLAUNCH,
        },
        {
          body: new Uint8Array([0, 1]),
          opcode: GameOpcode.CMSG_QUESTLOG_SWAP_QUEST,
        },
      ]);
    });
  });
});
