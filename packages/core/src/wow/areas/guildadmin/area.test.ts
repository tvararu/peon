import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  GUILDADMIN_INFO,
  guildadminGuildEventBody,
  guildadminGuildInfoBody,
} from "#test-support/areas/guildadmin";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parsePackedTime } from "#wow/protocol/packed-time";

function infoBytes() {
  return guildadminGuildInfoBody({
    ...GUILDADMIN_INFO,
    created: parsePackedTime(0x1a_90_6b_d0),
  });
}

describe("guildadmin area", () => {
  test("an injected SMSG_GUILD_INFO sets info and emits info", () => {
    const rig = areaRig("guildadmin");
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(GameOpcode.SMSG_GUILD_INFO, infoBytes());
      expect(rig.handle.state().info).toEqual({
        name: "FacSeedAlpha",
        created: parsePackedTime(0x1a_90_6b_d0),
        members: 1,
        accounts: 1,
      });
      expect(seen).toEqual(["info"]);
    } finally {
      rig.dispose();
    }
  });

  test("a peeked SMSG_GUILD_EVENT code 8 sets disbanded and emits disbanded", () => {
    const rig = areaRig("guildadmin");
    const seen: string[] = [];
    rig.handle.onEvent((event) => seen.push(event.type));
    try {
      rig.inject(GameOpcode.SMSG_GUILD_EVENT, guildadminGuildEventBody(3));
      expect(rig.handle.state().disbanded).toBe(false);
      expect(seen).toEqual([]);
      rig.inject(GameOpcode.SMSG_GUILD_EVENT, guildadminGuildEventBody(8));
      expect(rig.handle.state().disbanded).toBe(true);
      expect(seen).toEqual(["disbanded"]);
    } finally {
      rig.dispose();
    }
  });

  test("act.info sends CMSG_GUILD_INFO and resolves with the injected reply", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.info();
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_GUILD_INFO, body: new Uint8Array() },
      ]);
      rig.inject(GameOpcode.SMSG_GUILD_INFO, infoBytes());
      expect(await pending).toEqual({
        name: "FacSeedAlpha",
        created: parsePackedTime(0x1a_90_6b_d0),
        members: 1,
        accounts: 1,
      });
    } finally {
      rig.dispose();
    }
  });

  test("act.info with no reply settles no_reply after 5 s", async () => {
    jest.useFakeTimers();
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.info();
      jest.advanceTimersByTime(4999);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_reply" });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("act.disband without confirm sends nothing and returns refused", async () => {
    const rig = areaRig("guildadmin");
    try {
      expect(await rig.handle.act.disband({ confirm: false })).toEqual({
        status: "refused",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("act.disband with confirm sends CMSG_GUILD_DISBAND and resolves on GE_DISBANDED", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.disband({ confirm: true });
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_GUILD_DISBAND, body: new Uint8Array() },
      ]);
      rig.inject(GameOpcode.SMSG_GUILD_EVENT, guildadminGuildEventBody(8));
      expect(await pending).toEqual({ status: "disbanded" });
      expect(rig.handle.state().disbanded).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("act.disband with confirm settles no_reply after 5 s for a non-leader", async () => {
    jest.useFakeTimers();
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.disband({ confirm: true });
      jest.advanceTimersByTime(4999);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_reply" });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("run abort rejects a pending info", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.info();
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      void rig;
    }
  });
});
