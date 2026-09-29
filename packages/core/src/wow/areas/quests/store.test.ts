import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsGossipPoiBody,
  questsNpcTextUpdateBody,
  questsQueryQuestsCompletedResponseBody,
  questsQuestgiverStatusBody,
  questsQuestgiverStatusMultipleBody,
  questsQuestPoiQueryResponseBody,
} from "#test-support/areas/quests";
import type { QuestsEvent } from "#wow/areas/quests/store";
import { markOf } from "#wow/areas/quests/store-marks";
import { GameOpcode } from "#wow/protocol/opcodes";

const ERONA = 0xf1_30_00_3f_d1_00_1a_2bn;
const JESSE = 0xf1_30_00_3e_a7_00_1a_30n;
const CHEST = 0xf1_10_00_00_2c_00_00_07n;

function rigWithEvents() {
  let t = 1000;
  const rig = areaRig("quests", { now: () => t });
  const seen: QuestsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const multiple = (givers: { guid: bigint; status: number }[]) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_STATUS_MULTIPLE,
      questsQuestgiverStatusMultipleBody(givers),
    );
  const single = (guid: bigint, status: number) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_STATUS,
      questsQuestgiverStatusBody({ guid, status }),
    );
  const advance = (ms: number) => {
    t += ms;
  };
  return { advance, multiple, rig, seen, single };
}

describe("quests marks", () => {
  test("starts with no marks", () => {
    const { rig } = rigWithEvents();
    try {
      expect(rig.handle.state().marks.size).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("the multiple packet replaces every mark, because it lists every giver in view (Player.cpp:7915-7946)", () => {
    const { advance, multiple, rig } = rigWithEvents();
    try {
      multiple([
        { guid: ERONA, status: 8 },
        { guid: JESSE, status: 5 },
      ]);
      expect([...rig.handle.state().marks]).toEqual([
        [ERONA, { at: 1000, source: "multiple", status: 8 }],
        [JESSE, { at: 1000, source: "multiple", status: 5 }],
      ]);
      advance(500);
      multiple([{ guid: JESSE, status: 10 }]);
      expect([...rig.handle.state().marks]).toEqual([
        [JESSE, { at: 1500, source: "multiple", status: 10 }],
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_QUESTGIVER_STATUS sets one mark through peek (GossipDef.cpp:378-386)", () => {
    const { multiple, rig, single } = rigWithEvents();
    try {
      multiple([{ guid: ERONA, status: 8 }]);
      single(CHEST, 2);
      expect([...rig.handle.state().marks]).toEqual([
        [ERONA, { at: 1000, source: "multiple", status: 8 }],
        [CHEST, { at: 1000, source: "single", status: 2 }],
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("one marks event per change and none for a packet that changes nothing", () => {
    const { multiple, rig, seen, single } = rigWithEvents();
    try {
      multiple([
        { guid: ERONA, status: 8 },
        { guid: JESSE, status: 5 },
      ]);
      multiple([
        { guid: ERONA, status: 8 },
        { guid: JESSE, status: 5 },
      ]);
      multiple([{ guid: JESSE, status: 5 }]);
      single(JESSE, 5);
      single(CHEST, 8);
      expect(seen).toEqual([
        {
          changed: [ERONA, JESSE],
          givers: [
            { guid: ERONA, mark: "available", status: 8 },
            { guid: JESSE, mark: "incomplete", status: 5 },
          ],
          source: "multiple",
          type: "marks",
        },
        {
          changed: [ERONA],
          givers: [{ guid: JESSE, mark: "incomplete", status: 5 }],
          source: "multiple",
          type: "marks",
        },
        {
          changed: [CHEST],
          givers: [
            { guid: JESSE, mark: "incomplete", status: 5 },
            { guid: CHEST, mark: "available", status: 8 },
          ],
          source: "single",
          type: "marks",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("forget drops one mark in silence", () => {
    const { multiple, rig, seen } = rigWithEvents();
    try {
      multiple([
        { guid: ERONA, status: 8 },
        { guid: JESSE, status: 5 },
      ]);
      seen.length = 0;
      rig.stores.areas.quests.forget(ERONA);
      expect([...rig.handle.state().marks.keys()]).toEqual([JESSE]);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("markOf follows the dialog status enum (QuestDef.h:110-126)", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0x10_00].map((status) =>
        markOf(status),
      ),
    ).toEqual([
      "none",
      "none",
      "available_low",
      "reward",
      "available_repeatable",
      "incomplete",
      "reward",
      "available_repeatable",
      "available",
      "reward",
      "reward",
      "none",
    ]);
  });
});

describe("quests pois", () => {
  const reply = (questId: number, objectiveIndex: number) =>
    questsQuestPoiQueryResponseBody([
      {
        questId,
        pois: [
          {
            poiId: 1,
            objectiveIndex,
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

  test("the reply is matched by quest id and an empty list becomes none", () => {
    const rig = areaRig("quests", { now: () => 1000 });
    const seen: QuestsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.stores.areas.quests.queryPois([8325, 9999]);
      rig.inject(
        GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE,
        questsQuestPoiQueryResponseBody([
          { questId: 9999, pois: [] },
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
        ]),
      );
      const pois = rig.handle.state().pois;
      expect(pois.get(8325)?.status).toBe("known");
      expect(pois.get(9999)?.status).toBe("none");
      expect(seen).toHaveLength(1);
      expect(seen[0]?.type).toBe("poi");
    } finally {
      rig.dispose();
    }
  });

  test("expirePois marks a pending id no_reply and stays silent the second time", () => {
    const rig = areaRig("quests", { now: () => 1000 });
    const seen: QuestsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.stores.areas.quests.queryPois([8325]);
      rig.stores.areas.quests.expirePois([8325]);
      expect(rig.handle.state().pois.get(8325)?.status).toBe("no_reply");
      expect(seen).toHaveLength(1);
      rig.stores.areas.quests.expirePois([8325]);
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a reply for an unknown id is stored, and a later reply replaces it", () => {
    const rig = areaRig("quests", { now: () => 1000 });
    try {
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, reply(8325, -1));
      expect(rig.handle.state().pois.get(8325)?.status).toBe("known");
      rig.inject(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, reply(8325, 0));
      expect(rig.handle.state().pois.get(8325)?.pois[0]?.objectiveIndex).toBe(
        0,
      );
    } finally {
      rig.dispose();
    }
  });
});

const GUARD = 0xf1_30_00_05_8f_00_2b_11n;
const ERONA_TEXT = 8281;
const NO_EMOTES = [
  { delay: 0, emote: 0 },
  { delay: 0, emote: 0 },
  { delay: 0, emote: 0 },
];

function option(text0: string, probability = 1) {
  return { probability, text0, text1: text0, language: 7, emotes: NO_EMOTES };
}

describe("quests npc text", () => {
  test("a text reply is cached and the greeting is the highest-probability non-empty text", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_NPC_TEXT_UPDATE,
        questsNpcTextUpdateBody(ERONA_TEXT, [
          option("Second, $C.", 0.5),
          option("Welcome to Sunstrider Isle, $N."),
          option("", 2),
        ]),
      );
      expect(rig.handle.state().texts.get(ERONA_TEXT)?.status).toBe("known");
      expect(rig.stores.areas.quests.greeting(ERONA_TEXT)).toBe(
        "Welcome to Sunstrider Isle, $N.",
      );
      expect(seen).toEqual([
        { status: "known", textId: ERONA_TEXT, type: "npc_text" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the unknown-id reply greets with the fallback text", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_NPC_TEXT_UPDATE,
        questsNpcTextUpdateBody(999_999),
      );
      expect(rig.stores.areas.quests.greeting(999_999)).toBe("Greetings $N");
    } finally {
      rig.dispose();
    }
  });

  test("a text reply keeps the giver guid of its pending query", () => {
    const { rig } = rigWithEvents();
    try {
      rig.stores.areas.quests.requestNpcText(ERONA_TEXT, GUARD);
      rig.inject(
        GameOpcode.SMSG_NPC_TEXT_UPDATE,
        questsNpcTextUpdateBody(ERONA_TEXT, [option("Hail.")]),
      );
      expect(rig.stores.areas.quests.greeting(ERONA_TEXT)).toBe("Hail.");
      expect(rig.handle.state().texts.get(ERONA_TEXT)).toMatchObject({
        guid: GUARD,
        status: "known",
      });
    } finally {
      rig.dispose();
    }
  });
});

describe("quests completed", () => {
  const completed = (rig: ReturnType<typeof areaRig>, ids: number[]) =>
    rig.inject(
      GameOpcode.SMSG_QUERY_QUESTS_COMPLETED_RESPONSE,
      questsQueryQuestsCompletedResponseBody(ids),
    );

  test("starts with no completed list", () => {
    const { rig } = rigWithEvents();
    try {
      expect(rig.handle.state().completed).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("the reply replaces the completed ids and emits their count", () => {
    const { advance, rig, seen } = rigWithEvents();
    try {
      completed(rig, [8325, 8326]);
      advance(200);
      completed(rig, [8325]);
      expect(rig.handle.state().completed).toEqual({
        at: 1200,
        ids: new Set([8325]),
      });
      expect(seen).toEqual([
        { count: 2, type: "completed" },
        { count: 1, type: "completed" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a rewarded quest joins a known list in silence and waits for a list otherwise", () => {
    const { advance, rig, seen } = rigWithEvents();
    const store = rig.stores.areas.quests;
    try {
      store.addCompleted(8325);
      expect(rig.handle.state().completed).toBeUndefined();
      completed(rig, [8325]);
      advance(50);
      store.addCompleted(8326);
      expect(rig.handle.state().completed).toEqual({
        at: 1050,
        ids: new Set([8325, 8326]),
      });
      expect(seen).toEqual([{ count: 1, type: "completed" }]);
    } finally {
      rig.dispose();
    }
  });

  test("a snapshot keeps its ids when the list changes later", () => {
    const { rig } = rigWithEvents();
    try {
      completed(rig, [8325]);
      const before = rig.handle.state().completed;
      rig.stores.areas.quests.addCompleted(8326);
      expect(before?.ids).toEqual(new Set([8325]));
    } finally {
      rig.dispose();
    }
  });
});

describe("quests gossip POI", () => {
  test("an injected POI is set with the giver open at arrival", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.stores.quests.requestIntent({ action: "talk", guid: GUARD });
      rig.inject(
        GameOpcode.SMSG_GOSSIP_POI,
        questsGossipPoiBody({
          flags: 99,
          x: -8867.5,
          y: 673.25,
          icon: 7,
          importance: 6,
          name: "The Gilded Rose",
        }),
      );
      expect(rig.handle.state().gossipPoi).toEqual({
        flags: 99,
        x: -8867.5,
        y: 673.25,
        icon: 7,
        importance: 6,
        name: "The Gilded Rose",
        at: 1000,
        from: GUARD,
      });
      expect(seen.at(-1)).toEqual({
        type: "gossip_poi",
        from: GUARD,
        name: "The Gilded Rose",
      });
    } finally {
      rig.dispose();
    }
  });
});
