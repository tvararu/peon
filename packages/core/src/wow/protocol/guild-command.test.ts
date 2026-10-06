import { describe, expect, test } from "bun:test";
import {
  formatGuildCommandError,
  GuildCommand,
  GuildCommandResult,
  parseGuildCommandResult,
  parseGuildInvitePacket,
} from "#wow/protocol/guild";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("GuildCommand", () => {
  test("matches AzerothCore's GuildCommandType (Guild.h:97-115)", () => {
    expect(GuildCommand).toMatchObject({
      CREATE: 0,
      INVITE: 1,
      QUIT: 3,
      ROSTER: 5,
      PROMOTE: 6,
      DEMOTE: 7,
      REMOVE: 8,
      CHANGE_LEADER: 10,
      EDIT_MOTD: 11,
      GUILD_CHAT: 13,
      FOUNDER: 14,
      CHANGE_RANK: 16,
      PUBLIC_NOTE: 19,
      VIEW_TAB: 21,
      MOVE_ITEM: 22,
      REPAIR: 25,
    });
  });
});

describe("GuildCommandResult", () => {
  test("matches AzerothCore's GuildCommandError bank rows (Guild.h:138-142)", () => {
    expect(GuildCommandResult).toMatchObject({
      GUILD_UNK1: 20,
      GUILD_WITHDRAW_LIMIT: 25,
      GUILD_NOT_ENOUGH_MONEY: 26,
      GUILD_BANK_FULL: 28,
      GUILD_ITEM_NOT_FOUND: 29,
    });
  });
});

describe("parseGuildCommandResult", () => {
  test("parses command, name, and result", () => {
    const w = new PacketWriter();
    w.uint32LE(GuildCommand.INVITE);
    w.cString("Thrall");
    w.uint32LE(GuildCommandResult.ALREADY_IN_GUILD_S);
    const result = parseGuildCommandResult(new PacketReader(w.finish()));
    expect(result).toEqual({
      command: GuildCommand.INVITE,
      name: "Thrall",
      result: GuildCommandResult.ALREADY_IN_GUILD_S,
    });
  });

  test("parses result with empty name", () => {
    const w = new PacketWriter();
    w.uint32LE(GuildCommand.QUIT);
    w.cString("");
    w.uint32LE(GuildCommandResult.GUILD_LEADER_LEAVE_OR_PERMISSIONS);
    const result = parseGuildCommandResult(new PacketReader(w.finish()));
    expect(result.command).toBe(GuildCommand.QUIT);
    expect(result.name).toBe("");
    expect(result.result).toBe(
      GuildCommandResult.GUILD_LEADER_LEAVE_OR_PERMISSIONS,
    );
  });

  test("consumes all bytes", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.cString("X");
    w.uint32LE(0);
    const r = new PacketReader(w.finish());
    parseGuildCommandResult(r);
    expect(r.remaining).toBe(0);
  });
});

describe("parseGuildInvitePacket", () => {
  test("parses inviter name and guild name", () => {
    const w = new PacketWriter();
    w.cString("Thrall");
    w.cString("Horde Heroes");
    const result = parseGuildInvitePacket(new PacketReader(w.finish()));
    expect(result).toEqual({
      inviterName: "Thrall",
      guildName: "Horde Heroes",
    });
  });

  test("consumes all bytes", () => {
    const w = new PacketWriter();
    w.cString("A");
    w.cString("B");
    const r = new PacketReader(w.finish());
    parseGuildInvitePacket(r);
    expect(r.remaining).toBe(0);
  });
});

describe("formatGuildCommandError", () => {
  test("returns undefined for success (PLAYER_NO_MORE_IN_GUILD)", () => {
    expect(
      formatGuildCommandError(GuildCommand.INVITE, "Thrall", 0x00),
    ).toBeUndefined();
  });

  const cases: readonly [code: number, name: string][] = [
    [0x01, ""],
    [0x02, ""],
    [0x03, "Thrall"],
    [0x04, ""],
    [0x05, "Jaina"],
    [0x06, ""],
    [0x07, "Horde"],
    [0x08, ""],
    [0x09, ""],
    [0x0a, "Garrosh"],
    [0x0b, "Nobody"],
    [0x0c, "Alliance"],
    [0x0d, "Officer"],
    [0x0e, "Recruit"],
    [0x11, ""],
    [0x12, ""],
    [0x13, "Snob"],
  ];
  const fallback = formatGuildCommandError(0, "", 0xff);

  test("every result code gets a [guild] message distinct from every other code and the generic fallback", () => {
    const messages = cases.map(([code, name]) => {
      const message = formatGuildCommandError(0, name, code);
      expect(message).toStartWith("[guild] ");
      return message;
    });
    expect(new Set(messages).size).toBe(cases.length);
    expect(messages).not.toContain(fallback);
  });

  test.each(cases.filter(([, name]) => name !== ""))(
    "result code %p renders the substituted name",
    (code, name) => {
      expect(formatGuildCommandError(0, name, code)).toContain(name);
    },
  );

  test("returns generic error for unknown result code", () => {
    expect(formatGuildCommandError(0, "", 0xff)).toBe(
      "[guild] Guild command error (255)",
    );
  });
});
