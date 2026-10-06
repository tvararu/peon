import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  calendarArenaTeamBody,
  calendarEventInviteBody,
  calendarEventStatusBody,
  calendarFilterGuildBody,
  calendarInviteRemovedAlertBody,
  calendarInviteRemovedBody,
  calendarModeratorAlertBody,
  calendarRemovedAlertBody,
  calendarSendEventBody,
  calendarUpdatedAlertBody,
} from "#test-support/areas/calendar";
import { GameOpcode } from "#wow/protocol/opcodes";

const START = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 12,
  minute: 0,
};
const ZONE = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 19,
  minute: 0,
};

function eventBody(id: bigint, sendType = 0) {
  return calendarSendEventBody({
    creator: 0x0100_0000_0000_0001n,
    description: "details",
    dungeonId: -1,
    eventId: id,
    flags: 0,
    guildId: 0,
    sendType,
    time: START,
    title: "Draft",
    type: 0,
    zoneTime: ZONE,
  });
}

function createSpec() {
  return {
    description: "details",
    dungeonId: -1,
    flags: 0,
    maxInvites: 100,
    repeat: 0,
    time: START,
    title: "Raid",
    type: 0,
    zoneTime: ZONE,
  };
}

describe("calendar runtime writes", () => {
  test("create sends the packed spec with the character as owner and resolves on the add reply", async () => {
    const rig = areaRig("calendar");
    try {
      const spec = createSpec();
      const pending = rig.handle.act.create(spec);
      const [sent] = rig.sent;
      expect(sent?.opcode).toBe(GameOpcode.CMSG_CALENDAR_ADD_EVENT);
      expect(sent?.body.length).toBeGreaterThan(0);
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      const result = await pending;
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("no event");
      expect(result.eventId).toBe(7n);
      expect(rig.handle.state().createdByMe).toEqual([7n]);
    } finally {
      rig.dispose();
    }
  });

  test("create refuses a second create within 5 s and a long title locally", async () => {
    const rig = areaRig("calendar");
    try {
      const spec = createSpec();
      const first = rig.handle.act.create(spec);
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await first;
      const sent = rig.sent.length;
      const second = await rig.handle.act.create(spec);
      expect(second).toMatchObject({ error: 8, status: "refused" });
      expect(rig.sent.length).toBe(sent);
      const longTitle = await rig.handle.act.create({
        ...spec,
        title: "x".repeat(32),
      });
      expect(longTitle.status).toBe("refused");
    } finally {
      rig.dispose();
    }
  });

  test("update and remove refuse an event the character did not create", async () => {
    const rig = areaRig("calendar");
    try {
      const spec = createSpec();
      expect(await rig.handle.act.update(7n, 9n, spec)).toMatchObject({
        error: 6,
        status: "refused",
      });
      expect(await rig.handle.act.remove(7n, 9n)).toMatchObject({
        error: 6,
        status: "refused",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("update resolves on the updated alert and remove on the removed alert", async () => {
    const rig = areaRig("calendar");
    try {
      const spec = createSpec();
      const created = rig.handle.act.create(spec);
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await created;
      const updating = rig.handle.act.update(7n, 9n, spec);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_UPDATE_EVENT,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_UPDATED_ALERT,
        calendarUpdatedAlertBody({
          description: "details",
          dungeonId: -1,
          eventId: 7n,
          flags: 1,
          oldTime: START,
          time: START,
          title: "Raid",
          type: 0,
        }),
      );
      expect((await updating).status).toBe("ok");
      const removing = rig.handle.act.remove(7n, 9n);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_REMOVE_EVENT,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_REMOVED_ALERT,
        calendarRemovedAlertBody({ eventId: 7n, time: START }),
      );
      expect((await removing).status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("invite sends the player name and resolves on the invite packet", async () => {
    const rig = areaRig("calendar");
    try {
      const created = rig.handle.act.create({
        description: "details",
        dungeonId: -1,
        flags: 0,
        maxInvites: 100,
        repeat: 0,
        time: START,
        title: "Raid",
        type: 0,
        zoneTime: ZONE,
      });
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await created;
      const pending = rig.handle.act.invite(7n, "Thrall");
      const [sent] = rig.sent.slice(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_CALENDAR_EVENT_INVITE);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_INVITE,
        calendarEventInviteBody({
          eventId: 7n,
          invitee: 0x0100_0000_0000_0002n,
          inviteId: 9n,
          level: 80,
          status: 0,
        }),
      );
      expect((await pending).status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("answer resolves on the status packet and signup on clear pending", async () => {
    const rig = areaRig("calendar");
    try {
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n));
      const answering = rig.handle.act.answer(7n, 9n, 1);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_STATUS,
        calendarEventStatusBody({
          eventId: 7n,
          flags: 0,
          invitee: 0x0100_0000_0000_0001n,
          rank: 0,
          status: 1,
          statusTime: START,
          time: START,
        }),
      );
      expect((await answering).status).toBe("ok");
      const signing = rig.handle.act.signup(7n, false);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_CLEAR_PENDING_ACTION,
        new Uint8Array(),
      );
      expect((await signing).status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("setStatus, removeInvite and setModerator resolve on their alerts", async () => {
    const rig = areaRig("calendar");
    try {
      const created = rig.handle.act.create({
        description: "details",
        dungeonId: -1,
        flags: 0,
        maxInvites: 100,
        repeat: 0,
        time: START,
        title: "Raid",
        type: 0,
        zoneTime: ZONE,
      });
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await created;
      const invitee = 0x0100_0000_0000_0002n;
      const setting = rig.handle.act.setStatus(7n, 9n, invitee, 1);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_EVENT_STATUS,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_STATUS,
        calendarEventStatusBody({
          eventId: 7n,
          flags: 0,
          invitee,
          rank: 0,
          status: 1,
          statusTime: START,
          time: START,
        }),
      );
      expect((await setting).status).toBe("ok");
      const moderating = rig.handle.act.setModerator(7n, 9n, invitee, 1);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_EVENT_MODERATOR_STATUS,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_MODERATOR_STATUS_ALERT,
        calendarModeratorAlertBody({ eventId: 7n, invitee, rank: 1 }),
      );
      expect((await moderating).status).toBe("ok");
      const removing = rig.handle.act.removeInvite(7n, 9n, invitee);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_EVENT_REMOVE_INVITE,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_INVITE_REMOVED,
        calendarInviteRemovedBody({ eventId: 7n, flags: 0, invitee }),
      );
      expect((await removing).status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("removeInvite refuses removing the character itself", async () => {
    const rig = areaRig("calendar", { selfGuid: 0x0100_0000_0000_0001n });
    try {
      const created = rig.handle.act.create({
        description: "details",
        dungeonId: -1,
        flags: 0,
        maxInvites: 100,
        repeat: 0,
        time: START,
        title: "Raid",
        type: 0,
        zoneTime: ZONE,
      });
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await created;
      expect(
        await rig.handle.act.removeInvite(7n, 9n, 0x0100_0000_0000_0001n),
      ).toMatchObject({ error: 22, status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("complain sends without waiting and filter and arena resolve on their replies", async () => {
    const rig = areaRig("calendar");
    try {
      rig.handle.act.complain(7n, 0x0100_0000_0000_0002n);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_CALENDAR_COMPLAIN);
      const filtering = rig.handle.act.filterGuild(1, 80, 3);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_CALENDAR_GUILD_FILTER,
      );
      rig.inject(
        GameOpcode.SMSG_CALENDAR_FILTER_GUILD,
        calendarFilterGuildBody({
          members: [{ guid: 0x0100_0000_0000_0002n }],
        }),
      );
      expect((await filtering).status).toBe("ok");
      const teaming = rig.handle.act.arenaTeam(12);
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_CALENDAR_ARENA_TEAM);
      rig.inject(
        GameOpcode.SMSG_CALENDAR_ARENA_TEAM,
        calendarArenaTeamBody({
          members: [{ guid: 0x0100_0000_0000_0002n }],
        }),
      );
      expect((await teaming).status).toBe("ok");
      expect(rig.handle.state().filterGuild).toHaveLength(1);
      expect(rig.handle.state().arenaTeam).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a removed-alert body clears a created event from the list", async () => {
    const rig = areaRig("calendar");
    try {
      const created = rig.handle.act.create({
        description: "details",
        dungeonId: -1,
        flags: 0,
        maxInvites: 100,
        repeat: 0,
        time: START,
        title: "Raid",
        type: 0,
        zoneTime: ZONE,
      });
      rig.inject(GameOpcode.SMSG_CALENDAR_SEND_EVENT, eventBody(7n, 1));
      await created;
      rig.inject(
        GameOpcode.SMSG_CALENDAR_EVENT_INVITE_REMOVED_ALERT,
        calendarInviteRemovedAlertBody({
          eventId: 7n,
          flags: 0,
          status: 9,
          time: START,
        }),
      );
      expect(rig.handle.state().selfInvites).toEqual({});
    } finally {
      rig.dispose();
    }
  });
});
