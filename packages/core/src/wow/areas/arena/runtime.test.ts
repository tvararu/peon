import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  arenaEventBody,
  arenaQueryBody,
  arenaQueuedBody,
  arenaResultBody,
  arenaRosterBody,
  arenaStatsBody,
} from "#test-support/areas/arena";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

describe("arena acts", () => {
  test("query sends CMSG_ARENA_TEAM_QUERY and returns the team", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.query(7);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_ARENA_TEAM_QUERY,
      ]);
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, arenaQueryBody());
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_STATS, arenaStatsBody());
      const { team } = await pending;
      expect(team.name).toBe("Faceless");
      expect(team.rating).toBe(1500);
    } finally {
      rig.dispose();
    }
  });

  test("roster sends CMSG_ARENA_TEAM_ROSTER and returns members", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.roster(7);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_ARENA_TEAM_ROSTER,
      ]);
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_ROSTER, arenaRosterBody(false));
      const { members } = await pending;
      expect(members.map((member) => member.name)).toEqual(["Facone"]);
    } finally {
      rig.dispose();
    }
  });

  test("invite reports the named refusal", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.invite(7, "Facghost");
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_COMMAND_RESULT,
        arenaResultBody(1, "", "Facghost", 11),
      );
      expect(await pending).toEqual({
        reason: "player_not_found",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("accept settles on the join broadcast", async () => {
    const rig = areaRig("arena");
    try {
      const invite = new PacketWriter();
      invite.cString("Facone");
      invite.cString("Faceless");
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_INVITE, invite.finish());
      const pending = rig.handle.act.accept();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_ARENA_TEAM_ACCEPT,
      ]);
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_EVENT,
        arenaEventBody(3, ["Faceless-self", "Faceless"], 0x0b_00n),
      );
      expect(await pending).toEqual({ team: "Faceless" });
    } finally {
      rig.dispose();
    }
  });

  test("accept without an invite refuses", async () => {
    const rig = areaRig("arena");
    try {
      expect(await rig.handle.act.accept()).toEqual({
        reason: "no_invite",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("disband settles on the disbanded broadcast", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.disband(7);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_EVENT,
        arenaEventBody(8, ["Facone", "Faceless"]),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("joinQueue settles on the peeked queued status", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.joinQueue(0x0d_00n, 0, false);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_BATTLEMASTER_JOIN_ARENA,
      ]);
      rig.inject(GameOpcode.SMSG_BATTLEFIELD_STATUS, arenaQueuedBody());
      const joined = await pending;
      expect(joined.status).toBe("queued");
      if (joined.status === "queued") expect(joined.slot).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("joinQueue reports a negative group-joined result", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.joinQueue(0x0d_00n, 0, false);
      await Promise.resolve();
      const w = new PacketWriter();
      w.uint32LE(0xff_ff_ff_ff);
      rig.inject(GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND, w.finish());
      expect(await pending).toEqual({ reason: "queue_-1", status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("joinQueue maps SMSG_ARENA_ERROR to no_teams", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.joinQueue(0x0d_00n, 0, true);
      await Promise.resolve();
      const w = new PacketWriter();
      w.uint32LE(0);
      w.uint8(2);
      rig.inject(GameOpcode.SMSG_ARENA_ERROR, w.finish());
      expect(await pending).toEqual({ arenaType: 2, status: "no_teams" });
    } finally {
      rig.dispose();
    }
  });

  test("leaveQueue sends the port packet with leave action", async () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_BATTLEFIELD_STATUS, arenaQueuedBody());
      const pending = rig.handle.act.leaveQueue(0);
      await Promise.resolve();
      const sent = rig.sent.map((packet) => packet.opcode);
      expect(sent[sent.length - 1]).toBe(GameOpcode.CMSG_BATTLEFIELD_PORT);
      const empty = new PacketWriter();
      empty.uint32LE(0);
      empty.uint64LE(0n);
      rig.inject(GameOpcode.SMSG_BATTLEFIELD_STATUS, empty.finish());
      expect(await pending).toEqual({ status: "left" });
    } finally {
      rig.dispose();
    }
  });

  test("inspect returns empty rows when nobody answers", async () => {
    const rig = areaRig("arena");
    try {
      const pending = rig.handle.act.inspect(0x0c_00n);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.MSG_INSPECT_ARENA_TEAMS,
      ]);
      expect(await pending).toEqual({ guid: 0x0c_00n, rows: [] });
    } finally {
      rig.dispose();
    }
  }, 5000);
});
