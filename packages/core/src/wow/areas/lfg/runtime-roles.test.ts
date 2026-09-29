import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  lfgRoleCheckUpdateBody,
  lfgRoleChosenBody,
} from "#test-support/areas/lfg";
import type { PartyMember } from "#wow/party-store";
import { GameOpcode } from "#wow/protocol/opcodes";

function member(name: string, guid: bigint): PartyMember {
  return {
    name,
    guid,
    online: true,
    health: null,
    maxHealth: null,
    level: null,
    statsAt: null,
    source: null,
  };
}

function solo() {
  return areaRig("lfg", {
    legacy: {
      party: () => ({ inGroup: false, leader: null, loot: null, members: [] }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
}

function grouped() {
  return areaRig("lfg", {
    legacy: {
      party: () => ({
        inGroup: true,
        leader: null,
        loot: null,
        members: [member("Partner", 0xden)],
      }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
}

function sentOpcode(
  rig: { sent: readonly { opcode: number }[] },
  opcode: number,
) {
  return rig.sent.filter((p) => p.opcode === opcode);
}

describe("lfg runtime roles and comment", () => {
  test("setRoles refuses no_role_check and settles on this player's role_chosen", async () => {
    const rig = grouped();
    try {
      expect(await rig.handle.act.setRoles(2)).toEqual({
        status: "refused",
        reason: "no_role_check",
      });
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE,
        lfgRoleCheckUpdateBody({ state: 2, dungeons: [], members: [] }),
      );
      const pending = rig.handle.act.setRoles(2);
      expect(sentOpcode(rig, GameOpcode.CMSG_LFG_SET_ROLES)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHOSEN,
        lfgRoleChosenBody({ guid: 0n, roles: 2 }),
      );
      expect(await pending).toEqual({ status: "ok", roles: 2 });
    } finally {
      rig.dispose();
    }
  });

  test("setRoles(1) settles refused although the server echoes ready (LFGHandler.cpp:383-392)", async () => {
    const rig = grouped();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE,
        lfgRoleCheckUpdateBody({ state: 2, dungeons: [], members: [] }),
      );
      const pending = rig.handle.act.setRoles(1);
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHOSEN,
        lfgRoleChosenBody({ guid: 0n, roles: 1 }),
      );
      expect(await pending).toEqual({ status: "refused", reason: "no_role" });
    } finally {
      rig.dispose();
    }
  });

  test("setRoles(0) during a check settles refused on the not-ready answer (LFGMgr.cpp:1490-1555)", async () => {
    const rig = grouped();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE,
        lfgRoleCheckUpdateBody({ state: 2, dungeons: [], members: [] }),
      );
      const pending = rig.handle.act.setRoles(0);
      expect(sentOpcode(rig, GameOpcode.CMSG_LFG_SET_ROLES)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHOSEN,
        lfgRoleChosenBody({ guid: 0n, roles: 0 }),
      );
      expect(await pending).toEqual({ status: "refused", reason: "no_role" });
    } finally {
      rig.dispose();
    }
  });

  test("setComment refuses too_long and settles ok after the send (LFGMgr.cpp:991-993)", async () => {
    const rig = solo();
    try {
      expect(await rig.handle.act.setComment("x".repeat(65))).toEqual({
        status: "refused",
        reason: "too_long",
      });
      expect(sentOpcode(rig, GameOpcode.CMSG_SET_LFG_COMMENT)).toHaveLength(0);
      expect(await rig.handle.act.setComment("peon")).toEqual({
        status: "ok",
      });
      expect(sentOpcode(rig, GameOpcode.CMSG_SET_LFG_COMMENT)).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });
});
