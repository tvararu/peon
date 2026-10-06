import { describe, expect, test } from "bun:test";
import { must } from "#test-support/must";
import {
  buildChatMessage,
  buildNameQuery,
  buildWhoRequest,
  parseChatMessage,
  parseNameQueryResponse,
  parseWhoResponse,
} from "#wow/protocol/chat";
import { ChatType, Language } from "#wow/protocol/enums";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("parseChatMessage", () => {
  test("parses a SAY message", () => {
    const w = new PacketWriter();
    w.uint8(ChatType.SAY);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(5);
    w.rawBytes(new TextEncoder().encode("hello"));
    w.uint8(0);

    const msg = parseChatMessage(new PacketReader(w.finish()));
    expect(msg.type).toBe(ChatType.SAY);
    expect(msg.senderGuidLow).toBe(0x42);
    expect(msg.message).toBe("hello");
    expect(msg.channel).toBeUndefined();
    expect(msg.senderName).toBeUndefined();
  });

  test("parses a CHANNEL message with channel name", () => {
    const w = new PacketWriter();
    w.uint8(ChatType.CHANNEL);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(0);
    w.cString("General");
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(2);
    w.rawBytes(new TextEncoder().encode("hi"));
    w.uint8(0);

    const msg = parseChatMessage(new PacketReader(w.finish()));
    expect(msg.type).toBe(ChatType.CHANNEL);
    expect(msg.channel).toBe("General");
    expect(msg.message).toBe("hi");
  });

  test("parses a GM message with embedded sender name", () => {
    const w = new PacketWriter();
    w.uint8(ChatType.SAY);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(0);
    const nameBytes = new TextEncoder().encode("GameMaster");
    w.uint32LE(nameBytes.byteLength + 1);
    w.rawBytes(nameBytes);
    w.uint8(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(5);
    w.rawBytes(new TextEncoder().encode("hello"));
    w.uint8(0);

    const msg = parseChatMessage(new PacketReader(w.finish()), true);
    expect(msg.type).toBe(ChatType.SAY);
    expect(msg.senderName).toBe("GameMaster");
    expect(msg.message).toBe("hello");
  });

  test("parses a monster yell message with embedded sender name", () => {
    const w = new PacketWriter();
    w.uint8(0x0e);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(0);
    const nameBytes = new TextEncoder().encode("Zapetta");
    w.uint32LE(nameBytes.byteLength + 1);
    w.rawBytes(nameBytes);
    w.uint8(0);
    w.uint32LE(0x00);
    w.uint32LE(0x00);
    const msgBytes = new TextEncoder().encode(
      "The zeppelin to Orgrimmar has arrived!",
    );
    w.uint32LE(msgBytes.byteLength + 1);
    w.rawBytes(msgBytes);
    w.uint8(0);
    w.uint8(0);

    const msg = parseChatMessage(new PacketReader(w.finish()));
    expect(msg.type).toBe(0x0e);
    expect(msg.senderName).toBe("Zapetta");
    expect(msg.message).toBe("The zeppelin to Orgrimmar has arrived!");
  });

  function sized(w: PacketWriter, text: string) {
    const bytes = new TextEncoder().encode(text);
    w.uint32LE(bytes.byteLength + 1);
    w.rawBytes(bytes);
    w.uint8(0);
  }

  function monsterSay(receiver: bigint) {
    const w = new PacketWriter();
    w.uint8(ChatType.MONSTER_SAY);
    w.uint32LE(0);
    w.uint64LE(0xf130000000000042n);
    w.uint32LE(0);
    sized(w, "Guard");
    w.uint64LE(receiver);
    if (receiver >> 48n === 0xf130n) sized(w, "Peon");
    sized(w, "Back to work!");
    w.uint8(0);
    return new PacketReader(w.finish());
  }

  test("monster chat to a creature skips the receiver name", () => {
    const r = monsterSay(0xf130000000000099n);
    const msg = parseChatMessage(r);
    expect(msg.senderName).toBe("Guard");
    expect(msg.message).toBe("Back to work!");
    expect(r.remaining).toBe(0);
  });

  test("monster chat to a player has no receiver name", () => {
    const r = monsterSay(0x99n);
    expect(parseChatMessage(r).message).toBe("Back to work!");
    expect(r.remaining).toBe(0);
  });

  test("battleground system chat skips a non-player receiver name", () => {
    const w = new PacketWriter();
    w.uint8(ChatType.BG_SYSTEM_NEUTRAL);
    w.uint32LE(0);
    w.uint64LE(0n);
    w.uint32LE(0);
    w.uint64LE(0xf140000000000007n);
    sized(w, "Wolf");
    sized(w, "The battle begins");
    w.uint8(0);
    const r = new PacketReader(w.finish());
    const msg = parseChatMessage(r);
    expect(msg.senderName).toBeUndefined();
    expect(msg.message).toBe("The battle begins");
    expect(r.remaining).toBe(0);
  });

  const chatBody = (
    type: number,
    message: string,
    achievementId?: number,
  ): Uint8Array => {
    const w = new PacketWriter();
    w.uint8(type);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    w.uint32LE(0);
    w.uint32LE(0x42);
    w.uint32LE(0x00);
    const bytes = new TextEncoder().encode(message);
    w.uint32LE(bytes.byteLength + 1);
    w.rawBytes(bytes);
    w.uint8(0);
    w.uint8(0);
    if (achievementId !== undefined) w.uint32LE(achievementId);
    return w.finish();
  };

  test("reads the achievement id after the tag of an achievement message", () => {
    const msg = parseChatMessage(
      new PacketReader(chatBody(ChatType.ACHIEVEMENT, "link", 6)),
    );
    expect(msg.type).toBe(ChatType.ACHIEVEMENT);
    expect(msg.message).toBe("link");
    expect(msg.achievementId).toBe(6);
  });

  test("reads the achievement id of a guild achievement message", () => {
    const msg = parseChatMessage(
      new PacketReader(chatBody(ChatType.GUILD_ACHIEVEMENT, "link", 2188)),
    );
    expect(msg.type).toBe(ChatType.GUILD_ACHIEVEMENT);
    expect(msg.achievementId).toBe(2188);
  });

  test("leaves the achievement id unset when the body ends at the tag", () => {
    const msg = parseChatMessage(
      new PacketReader(chatBody(ChatType.ACHIEVEMENT, "link")),
    );
    expect(msg.achievementId).toBeUndefined();
  });

  test("parses an ignored notice with its message and no achievement id", () => {
    const msg = parseChatMessage(
      new PacketReader(chatBody(ChatType.IGNORED, "Own", 9)),
    );
    expect(msg.type).toBe(0x19);
    expect(msg.message).toBe("Own");
    expect(msg.senderGuidLow).toBe(0x42);
    expect(msg.achievementId).toBeUndefined();
  });

  test("an ordinary say has no achievement id", () => {
    const msg = parseChatMessage(
      new PacketReader(chatBody(ChatType.SAY, "hi", 5)),
    );
    expect(msg.achievementId).toBeUndefined();
  });
});

describe("buildChatMessage", () => {
  test("builds a SAY message", () => {
    const body = buildChatMessage(ChatType.SAY, Language.COMMON, "hello");
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(ChatType.SAY);
    expect(r.uint32LE()).toBe(Language.COMMON);
    expect(r.cString()).toBe("hello");
    expect(r.remaining).toBe(0);
  });

  test("builds a WHISPER message with target name", () => {
    const body = buildChatMessage(
      ChatType.WHISPER,
      Language.ORCISH,
      "hey",
      "Xiara",
    );
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(ChatType.WHISPER);
    expect(r.uint32LE()).toBe(Language.ORCISH);
    expect(r.cString()).toBe("Xiara");
    expect(r.cString()).toBe("hey");
  });

  test("builds a CHANNEL message with channel name", () => {
    const body = buildChatMessage(
      ChatType.CHANNEL,
      Language.COMMON,
      "hi",
      "General",
    );
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(ChatType.CHANNEL);
    expect(r.uint32LE()).toBe(Language.COMMON);
    expect(r.cString()).toBe("General");
    expect(r.cString()).toBe("hi");
  });
});

describe("buildNameQuery / parseNameQueryResponse", () => {
  test("builds a name query packet", () => {
    const body = buildNameQuery(0x42, 0x00);
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0x42);
    expect(r.uint32LE()).toBe(0x00);
  });

  test("parses a successful name query response", () => {
    const w = new PacketWriter();
    w.uint8(0x01);
    w.uint8(0x42);
    w.uint8(0);
    w.cString("Xiara");
    w.cString("");
    w.uint32LE(1);
    w.uint32LE(0);
    w.uint32LE(5);

    const result = parseNameQueryResponse(new PacketReader(w.finish()));
    expect(result.guidLow).toBe(0x42);
    expect(result.found).toBe(true);
    expect(result.name).toBe("Xiara");
  });

  test("parses a not-found name query response", () => {
    const w = new PacketWriter();
    w.uint8(0x01);
    w.uint8(0x42);
    w.uint8(1);

    const result = parseNameQueryResponse(new PacketReader(w.finish()));
    expect(result.guidLow).toBe(0x42);
    expect(result.found).toBe(false);
  });
});

describe("buildWhoRequest / parseWhoResponse", () => {
  test("builds a who request with defaults", () => {
    const body = buildWhoRequest({});
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0);
    expect(r.uint32LE()).toBe(100);
    expect(r.cString()).toBe("");
    expect(r.cString()).toBe("");
  });

  test("builds a who request with name filter", () => {
    const body = buildWhoRequest({ name: "Xiara" });
    const r = new PacketReader(body);
    r.uint32LE();
    r.uint32LE();
    expect(r.cString()).toBe("Xiara");
  });

  test("parses a who response", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.uint32LE(1);
    w.cString("Xiara");
    w.cString("TestGuild");
    w.uint32LE(80);
    w.uint32LE(5);
    w.uint32LE(1);
    w.uint8(0);
    w.uint32LE(1);

    const results = parseWhoResponse(new PacketReader(w.finish()));
    expect(results).toHaveLength(1);
    expect(must(results[0]).name).toBe("Xiara");
    expect(must(results[0]).guild).toBe("TestGuild");
    expect(must(results[0]).level).toBe(80);
  });

  test("parses an empty who response", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.uint32LE(0);

    const results = parseWhoResponse(new PacketReader(w.finish()));
    expect(results).toHaveLength(0);
  });
});
