import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsQuestgiverStatusBody,
  questsQuestgiverStatusMultipleBody,
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
