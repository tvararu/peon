import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  calendarCommandResultBody,
  calendarNumPendingBody,
  calendarSendCalendarBody,
  calendarSendEventBody,
} from "#test-support/areas/calendar";
import { fakeTimed } from "#test-support/fake-time";
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

function eventBody(id: bigint) {
  return calendarSendEventBody({
    creator: 0x0100_0000_0000_0001n,
    description: "details",
    dungeonId: -1,
    eventId: id,
    flags: 0,
    guildId: 0,
    sendType: 0,
    time: START,
    title: "Draft",
    type: 0,
    zoneTime: ZONE,
  });
}

describe("calendar runtime", () => {
  test("get sends an empty CMSG_CALENDAR_GET_CALENDAR and resolves with the reply state", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.get();
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array(),
          opcode: GameOpcode.CMSG_CALENDAR_GET_CALENDAR,
        },
      ]);
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_CALENDAR, fullBody());
      const result = await pending;
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("no calendar");
      expect(
        result.state.events.map((e: { title: string }) => e.title),
      ).toEqual(["Raid"]);
      expect(
        result.state.invites.map((i: { inviteId: bigint }) => i.inviteId),
      ).toEqual([9n]);
      expect(result.state.serverOffsetSeconds).toBe(
        Math.floor(Date.UTC(2026, 6, 4, 19, 0) / 1000) - 1_790_928_000,
      );
    } finally {
      rig.dispose();
    }
  });

  test("get rejects after 5 s with no reply", async () => {
    const { ms, run } = await fakeTimed(async () => {
      const rig = areaRig("calendar");
      try {
        return await rig.handle.act.get();
      } finally {
        rig.dispose();
      }
    }, 6000);
    await expect(run).rejects.toThrow("timeout");
    expect(ms).toBeGreaterThanOrEqual(5000);
  });

  test("event sends the u64 id and resolves with the stored detail", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.event(7n);
      const [sent] = rig.sent;
      expect(sent?.opcode).toBe(GameOpcode.CMSG_CALENDAR_GET_EVENT);
      expect(sent?.body).toEqual(new Uint8Array([7, 0, 0, 0, 0, 0, 0, 0]));
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n));
      const result = await pending;
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("no event");
      expect(result.detail.title).toBe("Draft");
      expect(result.state.details["7"]?.description).toBe("details");
    } finally {
      rig.dispose();
    }
  });

  test("event settles refused on a command-result error", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.event(7n);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_COMMAND_RESULT,
        calendarCommandResultBody({ error: 6 }),
      );
      const result = await pending;
      expect(result).toEqual({ error: 6, name: "", status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("event rejects after 5 s with no reply", async () => {
    const { run } = await fakeTimed(async () => {
      const rig = areaRig("calendar");
      try {
        return await rig.handle.act.event(7n);
      } finally {
        rig.dispose();
      }
    }, 6000);
    await expect(run).rejects.toThrow("timeout");
  });

  test("pending sends an empty CMSG_CALENDAR_GET_NUM_PENDING and resolves with the count", async () => {
    const rig = areaRig("calendar");
    try {
      const pending = rig.handle.act.pending();
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array(),
          opcode: GameOpcode.CMSG_CALENDAR_GET_NUM_PENDING,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_SEND_NUM_PENDING,
        calendarNumPendingBody(3),
      );
      expect(await pending).toEqual({ pending: 3, status: "ok" });
      expect(rig.handle.state().pending).toBe(3);
    } finally {
      rig.dispose();
    }
  });

  test("pending rejects after 5 s with no reply", async () => {
    const { run } = await fakeTimed(async () => {
      const rig = areaRig("calendar");
      try {
        return await rig.handle.act.pending();
      } finally {
        rig.dispose();
      }
    }, 6000);
    await expect(run).rejects.toThrow("timeout");
  });
});
