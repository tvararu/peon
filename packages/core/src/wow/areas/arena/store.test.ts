import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  arenaEventBody,
  arenaQueuedBody,
  arenaQueryBody,
  arenaResultBody,
  arenaRosterBody,
  arenaStatsBody,
} from "#test-support/areas/arena";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

describe("arena store", () => {
  test("query and stats merge into one team", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, arenaQueryBody());
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_STATS, arenaStatsBody());
      const team = rig.stores.areas.arena.snapshot().teams["7"];
      expect(team?.name).toBe("Faceless");
      expect(team?.rating).toBe(1500);
      expect(team?.rank).toBe(1234);
      expect(team?.stale).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  test("roster fills the members", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, arenaQueryBody());
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_ROSTER, arenaRosterBody(false));
      const team = rig.stores.areas.arena.snapshot().teams["7"];
      expect(team?.members.map((member) => member.name)).toEqual(["Facone"]);
      expect(team?.members[0]?.captain).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("invite stores the pending invite", () => {
    const rig = areaRig("arena");
    try {
      const w = new PacketWriter();
      w.cString("Facone");
      w.cString("Faceless");
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_INVITE, w.finish());
      expect(rig.stores.areas.arena.snapshot().invite).toEqual({
        inviter: "Facone",
        team: "Faceless",
      });
    } finally {
      rig.dispose();
    }
  });

  test("leave event drops the named member", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, arenaQueryBody());
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_ROSTER, arenaRosterBody(false));
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_EVENT,
        arenaEventBody(4, ["Facone", "Faceless"], 0x0b_00n),
      );
      expect(rig.stores.areas.arena.snapshot().teams["7"]?.members).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("disband event removes the team by name", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, arenaQueryBody());
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_EVENT,
        arenaEventBody(8, ["Facone", "Faceless"]),
      );
      expect(rig.stores.areas.arena.snapshot().teams["7"]).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("command result records the named error", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(
        GameOpcode.SMSG_ARENA_TEAM_COMMAND_RESULT,
        arenaResultBody(1, "", "Facghost", 11),
      );
      expect(rig.stores.areas.arena.snapshot().result).toEqual({
        action: "invite",
        error: "player_not_found",
        ok: false,
        player: "Facghost",
        team: "",
      });
    } finally {
      rig.dispose();
    }
  });

  test("inspect merges rows per slot", () => {
    const rig = areaRig("arena");
    try {
      const row = (slot: number): Uint8Array => {
        const w = new PacketWriter();
        w.uint64LE(0x0c_00n);
        w.uint8(slot);
        w.uint32LE(7);
        w.uint32LE(1500);
        w.uint32LE(40);
        w.uint32LE(25);
        w.uint32LE(30);
        w.uint32LE(1490);
        return w.finish();
      };
      rig.inject(GameOpcode.MSG_INSPECT_ARENA_TEAMS, row(0));
      rig.inject(GameOpcode.MSG_INSPECT_ARENA_TEAMS, row(0));
      expect(rig.stores.areas.arena.snapshot().inspected["0xc00"]).toHaveLength(
        1,
      );
    } finally {
      rig.dispose();
    }
  });

  test("peeked battlefield status tracks the queue", () => {
    const rig = areaRig("arena");
    try {
      rig.inject(GameOpcode.SMSG_BATTLEFIELD_STATUS, arenaQueuedBody());
      expect(rig.stores.areas.arena.snapshot().queue).toEqual([
        { arenaType: 2, kind: "queued", rated: false, slot: 0 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("unit destroyed records the guid", () => {
    const rig = areaRig("arena");
    try {
      const w = new PacketWriter();
      w.uint64LE(0x0d_00n);
      rig.inject(GameOpcode.SMSG_ARENA_UNIT_DESTROYED, w.finish());
      expect(rig.stores.areas.arena.snapshot().destroyed).toEqual(["0xd00"]);
    } finally {
      rig.dispose();
    }
  });
});
