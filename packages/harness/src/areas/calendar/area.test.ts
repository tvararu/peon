import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaState } from "@peon/core";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const ZONE = { day: 4, hour: 19, minute: 0, month: 7, weekday: 6, year: 2026 };
const READ: AreaState<"calendar"> = {
  arenaTeam: [],
  binds: [],
  clearedPending: 0,
  createdByMe: [],
  details: {},
  events: [
    {
      creator: 1n,
      dungeonId: -1,
      flags: 0,
      id: 7n,
      time: { ...ZONE, hour: 12 },
      title: "Raid",
      type: 0,
    },
  ],
  holidays: [],
  invites: [
    {
      creator: 2n,
      eventId: 7n,
      guildEvent: false,
      inviteId: 9n,
      rank: 4,
      status: 0,
    },
  ],
  pending: 2,
  receivedAt: 1,
  relationTime: 0,
  resets: [],
  selfInvites: {},
  serverOffsetSeconds: 25_200,
  serverTime: 1_790_928_000,
  zoneTime: ZONE,
  filterGuild: [],
  lockouts: [],
  lockoutUpdates: [],
};

function calendarEvent(type: "calendar" | "pending"): AreaEvent {
  if (type === "pending")
    return { area: "calendar", event: { pending: 2, state: READ, type } };
  return { area: "calendar", event: { state: READ, type } };
}

describe("calendar harness rules", () => {
  test("attach turns stored state into one calendar/read row", () => {
    const game = Object.assign(createMockGame(), {
      calendar: { ...createMockGame().calendar, state: () => READ },
    });
    const rows = attachDrafts(areaRuleSet(), game, testRuleInput());
    expect<unknown[]>(rows).toMatchObject([
      {
        class: "log",
        data: {
          events: 1,
          holidays: 0,
          invites: 1,
          pending: 2,
          serverOffsetSeconds: 25_200,
          serverTime: 1_790_928_000,
          source: "calendar",
          zoneTime: "2026-07-04 19:00",
        },
        domain: "calendar",
        event: "calendar/read",
      },
    ]);
    const [row] = rows;
    expect(row?.text).toContain("1 invites");
    expect(row?.text).toContain("1 events");
    expect(row?.text).toContain("2026-07-04 19:00");
  });

  test("attach writes nothing before the server sent any calendar", () => {
    expect(
      attachDrafts(areaRuleSet(), createMockGame(), testRuleInput()),
    ).toEqual([]);
  });

  test("command_result writes one refused row and event writes none", () => {
    const rules = areaRuleSet();
    const [refused] = areaDrafts(
      rules,
      {
        area: "calendar",
        event: { error: 6, name: "", state: READ, type: "command_result" },
      },
      testRuleInput(),
    );
    const pending = areaDrafts(
      rules,
      calendarEvent("pending"),
      testRuleInput(),
    );
    expect(refused).toMatchObject({
      data: { error: 6, source: "command_result" },
      event: "calendar/refused",
    });
    expect(refused?.text).toContain("refused");
    expect(refused?.text).toContain("error 6");
    expect(pending).toMatchObject([
      {
        data: { pending: 2, source: "pending" },
        event: "calendar/pending",
      },
    ]);
    expect(pending[0]?.text).toContain("2 pending");
    const none = areaDrafts(
      rules,
      { area: "calendar", event: { sendType: 0, state: READ, type: "event" } },
      testRuleInput(),
    );
    expect(none).toEqual([]);
  });
});
