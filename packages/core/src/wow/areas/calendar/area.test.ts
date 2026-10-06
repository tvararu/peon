import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { calendarSendCalendarBody } from "#test-support/areas/calendar";
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
});
