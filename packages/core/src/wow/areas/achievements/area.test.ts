import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  achievementsAchievementDeletedBody,
  achievementsAchievementEarnedBody,
  achievementsAllAchievementDataBody,
  achievementsCriteriaDeletedBody,
  achievementsCriteriaUpdateBody,
  achievementsServerFirstAchievementBody,
} from "#test-support/areas/achievements";
import { packTime } from "#test-support/areas/time";
import type { AchievementsEvent } from "#wow/areas/achievements/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const OTHER = 0xdc5n;
const LOGIN = {
  year: 2026,
  month: 9,
  day: 1,
  weekday: 2,
  hour: 8,
  minute: 0,
};
const LATER = { ...LOGIN, day: 28, weekday: 1 };

function rigWithEvents() {
  const rig = areaRig("achievements", { selfGuid: ME });
  const seen: AchievementsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const login = () =>
    rig.inject(
      GameOpcode.SMSG_ALL_ACHIEVEMENT_DATA,
      achievementsAllAchievementDataBody({
        criteria: [
          { counter: 10n, guid: ME, id: 34, packedTime: packTime(LOGIN) },
        ],
        done: [{ id: 6, packedTime: packTime(LOGIN) }],
      }),
    );
  return { login, rig, seen };
}

describe("achievements area wiring", () => {
  test("SMSG_ALL_ACHIEVEMENT_DATA fills the set and SMSG_CRITERIA_UPDATE emits nothing", () => {
    const { login, rig, seen } = rigWithEvents();
    try {
      login();
      rig.inject(
        GameOpcode.SMSG_CRITERIA_UPDATE,
        achievementsCriteriaUpdateBody({
          counter: 11n,
          guid: ME,
          id: 35,
          packedTime: packTime(LATER),
        }),
      );
      expect(rig.handle.state()).toEqual({
        count: 1,
        criteria: 2,
        recent: [{ at: LOGIN, id: 6 }],
      });
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_ACHIEVEMENT_EARNED adds the character's own achievement", () => {
    const { login, rig, seen } = rigWithEvents();
    try {
      login();
      rig.inject(
        GameOpcode.SMSG_ACHIEVEMENT_EARNED,
        achievementsAchievementEarnedBody({
          guid: ME,
          id: 7,
          packedTime: packTime(LATER),
        }),
      );
      rig.inject(
        GameOpcode.SMSG_ACHIEVEMENT_EARNED,
        achievementsAchievementEarnedBody({
          guid: OTHER,
          id: 8,
          packedTime: packTime(LATER),
        }),
      );
      expect(rig.handle.state().recent).toEqual([
        { at: LATER, id: 7 },
        { at: LOGIN, id: 6 },
      ]);
      expect(seen).toEqual([
        { guid: ME, id: 7, self: true, type: "achievement_earned" },
        { guid: OTHER, id: 8, self: false, type: "achievement_earned" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SERVER_FIRST_ACHIEVEMENT emits server_first", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SERVER_FIRST_ACHIEVEMENT,
        achievementsServerFirstAchievementBody({
          guid: OTHER,
          id: 457,
          link: 1,
          name: "Firsty",
        }),
      );
      expect(seen).toEqual([
        { guid: OTHER, id: 457, name: "Firsty", type: "server_first" },
      ]);
      expect(rig.handle.state().count).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_CRITERIA_DELETED and SMSG_ACHIEVEMENT_DELETED drop the entries", () => {
    const { login, rig, seen } = rigWithEvents();
    try {
      login();
      rig.inject(
        GameOpcode.SMSG_ACHIEVEMENT_DELETED,
        achievementsAchievementDeletedBody(6),
      );
      rig.inject(
        GameOpcode.SMSG_CRITERIA_DELETED,
        achievementsCriteriaDeletedBody(34),
      );
      expect(rig.handle.state()).toEqual({
        count: 0,
        criteria: 0,
        recent: [],
      });
      expect(seen).toEqual([
        { id: 6, type: "achievement_removed" },
        { id: 34, type: "criteria_removed" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the area events reach the world event bus", () => {
    const { rig } = rigWithEvents();
    const areas: string[] = [];
    rig.events.area.subscribe(({ area, event }) =>
      areas.push(`${area}/${event.type}`),
    );
    try {
      rig.inject(
        GameOpcode.SMSG_ACHIEVEMENT_DELETED,
        achievementsAchievementDeletedBody(6),
      );
      expect(areas).toEqual(["achievements/achievement_removed"]);
    } finally {
      rig.dispose();
    }
  });
});
