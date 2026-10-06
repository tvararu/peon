import { describe, expect, test } from "bun:test";
import {
  buildJoinChannel,
  buildLeaveChannel,
  buildRandomRoll,
  parseChannelNotify,
  parseNotification,
  parseRandomRoll,
  parseServerBroadcast,
} from "#wow/protocol/chat";
import { ChannelNotify } from "#wow/protocol/enums";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("parseChannelNotify", () => {
  test("parses YOU_JOINED", () => {
    const w = new PacketWriter();
    w.uint8(ChannelNotify.YOU_JOINED);
    w.cString("General - Elwynn Forest");
    w.uint8(0x10);
    w.uint32LE(1);
    w.uint32LE(0);

    const result = parseChannelNotify(new PacketReader(w.finish()));
    expect(result).toEqual({
      type: "joined",
      channel: "General - Elwynn Forest",
    });
  });

  test("parses YOU_LEFT", () => {
    const w = new PacketWriter();
    w.uint8(ChannelNotify.YOU_LEFT);
    w.cString("General - Elwynn Forest");
    w.uint32LE(1);
    w.uint8(1);

    const result = parseChannelNotify(new PacketReader(w.finish()));
    expect(result).toEqual({
      type: "left",
      channel: "General - Elwynn Forest",
    });
  });

  test("returns other for unknown type", () => {
    const w = new PacketWriter();
    w.uint8(0x00);
    w.cString("General");

    const result = parseChannelNotify(new PacketReader(w.finish()));
    expect(result).toEqual({ type: "other" });
  });

  test.each([
    ["WRONG_PASSWORD", ChannelNotify.WRONG_PASSWORD, "Secret"],
    ["NOT_MEMBER", ChannelNotify.NOT_MEMBER, "Trade"],
    ["BANNED", ChannelNotify.BANNED, "Trade"],
    ["MUTED", ChannelNotify.MUTED, "General"],
    ["ALREADY_MEMBER", ChannelNotify.ALREADY_MEMBER, "General"],
    ["INVALID_NAME", ChannelNotify.INVALID_NAME, ""],
    ["THROTTLED", ChannelNotify.THROTTLED, "General"],
    ["WRONG_FACTION", ChannelNotify.WRONG_FACTION, "General"],
    ["NOT_IN_AREA", ChannelNotify.NOT_IN_AREA, "LocalDefense"],
  ])("maps %s to an error carrying the channel", (_name, code, channel) => {
    const w = new PacketWriter();
    w.uint8(code);
    w.cString(channel);

    const result = parseChannelNotify(new PacketReader(w.finish()));
    expect(result).toMatchObject({ type: "error", channel, code });
    if (result.type !== "error") throw new Error("expected an error event");
    expect(result.message).toContain(channel);
  });
});

describe("buildJoinChannel", () => {
  test("builds join packet without password", () => {
    const body = buildJoinChannel("General");
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0);
    expect(r.uint8()).toBe(0);
    expect(r.uint8()).toBe(0);
    expect(r.cString()).toBe("General");
    expect(r.cString()).toBe("");
  });

  test("builds join packet with password", () => {
    const body = buildJoinChannel("Secret", "hunter2");
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0);
    expect(r.uint8()).toBe(0);
    expect(r.uint8()).toBe(0);
    expect(r.cString()).toBe("Secret");
    expect(r.cString()).toBe("hunter2");
  });
});

describe("buildLeaveChannel", () => {
  test("builds leave packet", () => {
    const body = buildLeaveChannel("General");
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0);
    expect(r.cString()).toBe("General");
  });
});

describe("buildRandomRoll", () => {
  test("builds a roll packet with min and max", () => {
    const body = buildRandomRoll(1, 100);
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(1);
    expect(r.uint32LE()).toBe(100);
  });
});

describe("parseRandomRoll", () => {
  test("parses a roll result", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.uint32LE(100);
    w.uint32LE(42);
    w.uint32LE(0x10);
    w.uint32LE(0x00);

    const result = parseRandomRoll(new PacketReader(w.finish()));
    expect(result.min).toBe(1);
    expect(result.max).toBe(100);
    expect(result.result).toBe(42);
    expect(result.guidLow).toBe(0x10);
    expect(result.guidHigh).toBe(0x00);
  });

  test("parses a roll with large guid", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.uint32LE(999);
    w.uint32LE(500);
    w.uint32LE(0xde_ad_be_ef);
    w.uint32LE(0x00_00_00_01);

    const result = parseRandomRoll(new PacketReader(w.finish()));
    expect(result.min).toBe(0);
    expect(result.max).toBe(999);
    expect(result.result).toBe(500);
    expect(result.guidLow).toBe(0xde_ad_be_ef);
    expect(result.guidHigh).toBe(0x00_00_00_01);
  });
});

describe("parseServerBroadcast", () => {
  test.each([
    [1, "15:00", ["shutdown", "15:00"]],
    [2, "05:00", ["restart", "05:00"]],
    [4, "", ["shutdown", "cancel"]],
    [5, "", ["restart", "cancel"]],
    [6, "10:00", ["battleground", "shutdown", "10:00"]],
    [7, "03:00", ["battleground", "restart", "03:00"]],
    [8, "02:00", ["instance", "shutdown", "02:00"]],
    [9, "01:00", ["instance", "restart", "01:00"]],
  ])("maps broadcast id %d to its label and time", (id, param, parts) => {
    const w = new PacketWriter();
    w.uint32LE(id);
    w.cString(param);
    const message = parseServerBroadcast(
      new PacketReader(w.finish()),
    ).message.toLowerCase();
    for (const part of parts) expect(message).toContain(part);
  });

  test("parses raw string message", () => {
    const w = new PacketWriter();
    w.uint32LE(3);
    w.cString("Custom admin broadcast");
    const result = parseServerBroadcast(new PacketReader(w.finish()));
    expect(result.message).toBe("Custom admin broadcast");
  });

  test("handles unknown message ID", () => {
    const w = new PacketWriter();
    w.uint32LE(99);
    w.cString("mystery");
    const result = parseServerBroadcast(new PacketReader(w.finish()));
    expect(result.message).toContain("99");
    expect(result.message).toContain("mystery");
  });
});

describe("parseNotification", () => {
  test("parses notification string", () => {
    const w = new PacketWriter();
    w.cString("Welcome to our server!");
    const result = parseNotification(new PacketReader(w.finish()));
    expect(result.message).toBe("Welcome to our server!");
  });
});
