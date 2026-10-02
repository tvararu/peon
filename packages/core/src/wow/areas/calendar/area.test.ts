import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  calendarCommandResultBody,
  calendarNumPendingBody,
  calendarSendCalendarBody,
  calendarSendEventBody,
} from "#test-support/areas/calendar";
import { GameOpcode } from "#wow/protocol/opcodes";

const ZONE = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 19,
  minute: 0,
};
const START = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 12,
  minute: 0,
};

function fullBody() {
  return calendarSendCalendarBody({
    events: [
      {
        creator: 0x0100_0000_0000_0001n,
        dungeonId: -1,
        flags: 0,
        id: 7n,
        time: START,
        title: "Raid",
        type: 0,
      },
    ],
    invites: [
      {
        creator: 0x0100_0000_0000_0002n,
        eventId: 7n,
        guildEvent: false,
        inviteId: 9n,
        rank: 4,
        status: 0,
      },
    ],
    serverTime: 1_790_928_000,
    zoneTime: ZONE,
  });
}

function eventBody() {
  return calendarSendEventBody({
    creator: 0x0100_0000_0000_0001n,
    description: "details",
    dungeonId: -1,
    eventId: 7n,
    flags: 0,
    guildId: 0,
    sendType: 0,
    time: START,
    title: "Draft",
    type: 0,
    zoneTime: ZONE,
  });
}

describe("calendar area wiring", () => {
  test("the send-calendar order fills the lists and fires calendar once", () => {
    const rig = areaRig("calendar");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_CALENDAR, fullBody());
      expect(
        rig.handle.state().events.map((e: { title: string }) => e.title),
      ).toEqual(["Raid"]);
      expect(
        rig.handle.state().invites.map((i: { inviteId: bigint }) => i.inviteId),
      ).toEqual([9n]);
      expect(rig.handle.state().serverTime).toBe(1_790_928_000);
      expect(seen).toEqual([{ state: rig.handle.state(), type: "calendar" }]);
    } finally {
      rig.dispose();
    }
  });

  test("a send-event reply stores the detail and a command result settles the event act", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.event(7n);
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody());
      const result = await pending;
      if (result.status !== "ok") throw new Error("no event");
      expect(result.detail.description).toBe("details");
      const refused = rig.handle.act.event(8n);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_COMMAND_RESULT,
        calendarCommandResultBody({ error: 6 }),
      );
      expect(await refused).toEqual({ error: 6, name: "", status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("a pending-count reply fills pending and the area owns its opcodes", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.pending();
      rig.inject(
        GameOpcode.SMSG_CALENDAR_SEND_NUM_PENDING,
        calendarNumPendingBody(2),
      );
      expect(await pending).toEqual({ pending: 2, status: "ok" });
      expect(rig.handle.state().pending).toBe(2);
    } finally {
      rig.dispose();
    }
  });
});
