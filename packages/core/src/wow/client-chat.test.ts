import { describe, expect, test } from "bun:test";
import { FIXTURE_CHARACTER } from "#test-support/fixtures";
import { startMockWorldServer } from "#test-support/mock-world-server";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import { type ChatMessage, type WorldHandle, worldSession } from "#wow/client";
import { NOT_IN_GUILD_TEXT } from "#wow/client-chat";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/entity-fields";
import { ChatType, GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

type Server = { inject: (opcode: number, body: Uint8Array) => void };

async function session(
  opts: { guildId?: number },
  body: (handle: WorldHandle, ws: Server) => Promise<void>,
): Promise<void> {
  const ws = await startMockWorldServer(opts);
  try {
    const handle = await worldSession(
      { ...base, host: "127.0.0.1", port: ws.port },
      fakeAuth(ws.port),
    );
    await waitForEchoProbe(handle);
    await body(handle, ws);
    handle.close();
    await handle.closed;
  } finally {
    ws.stop();
  }
}

function next(handle: WorldHandle, send: () => void): Promise<ChatMessage> {
  const { promise, resolve } = Promise.withResolvers<ChatMessage>();
  const off = handle.onMessage((message) => {
    off();
    resolve(message);
  });
  send();
  return promise;
}

async function updateSelf(
  handle: WorldHandle,
  ws: Server,
  fields: Map<number, number>,
  create: boolean,
): Promise<void> {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(create ? 3 : 0);
  writePackedGuid(w, handle.getControlState().selfGuid);
  if (create) {
    w.uint8(4);
    w.uint16LE(0);
  }
  writeUpdateMask(w, fields);
  ws.inject(GameOpcode.SMSG_UPDATE_OBJECT, w.finish());
  await waitForEchoProbe(handle);
}

function guildIdField(guildId: number): Map<number, number> {
  return new Map([[PLAYER_FIELDS.GUILDID.offset, guildId]]);
}

describe("chatMethods", () => {
  test("guild and officer chat from a guildless character say why and send nothing", async () => {
    await session({}, async (handle) => {
      const seen: ChatMessage[] = [];
      handle.onMessage((message) => seen.push(message));
      handle.sendGuild("gz");
      handle.sendOfficer("promote me");
      await next(handle, () => handle.sendSay("after"));
      expect(seen.map(({ type, message }) => [type, message])).toEqual([
        [ChatType.SYSTEM, NOT_IN_GUILD_TEXT],
        [ChatType.SYSTEM, NOT_IN_GUILD_TEXT],
        [ChatType.SAY, "after"],
      ]);
      expect(handle.getLastChatMode()).toEqual({ type: "say" });
    });
  });

  test("a guild member's guild and officer chat reach the server", async () => {
    await session({ guildId: 42 }, async (handle) => {
      const guild = await next(handle, () => handle.sendGuild("gz"));
      expect([guild.type, guild.message]).toEqual([ChatType.GUILD, "gz"]);
      const officer = await next(handle, () => handle.sendOfficer("psst"));
      expect([officer.type, officer.message]).toEqual([
        ChatType.OFFICER,
        "psst",
      ]);
      expect(handle.getLastChatMode()).toEqual({ type: "officer" });
    });
  });

  test("the character's guild id field wins over the login guild id", async () => {
    await session({}, async (handle, ws) => {
      await updateSelf(handle, ws, guildIdField(7), true);
      const joined = await next(handle, () => handle.sendGuild("hi guild"));
      expect(joined.type).toBe(ChatType.GUILD);
      await updateSelf(handle, ws, guildIdField(0), false);
      const left = await next(handle, () => handle.sendGuild("still here?"));
      expect([left.type, left.message]).toEqual([
        ChatType.SYSTEM,
        NOT_IN_GUILD_TEXT,
      ]);
    });
  });

  test("a self create without the guild id field keeps the login guild id", async () => {
    await session({ guildId: 42 }, async (handle, ws) => {
      const health = new Map([[UNIT_FIELDS.HEALTH.offset, 100]]);
      await updateSelf(handle, ws, health, true);
      const guild = await next(handle, () => handle.sendGuild("still guilded"));
      expect([guild.type, guild.message]).toEqual([
        ChatType.GUILD,
        "still guilded",
      ]);
      await updateSelf(handle, ws, guildIdField(0), false);
      const left = await next(handle, () => handle.sendOfficer("gone?"));
      expect([left.type, left.message]).toEqual([
        ChatType.SYSTEM,
        NOT_IN_GUILD_TEXT,
      ]);
    });
  });

  test("the reply target is the last player who whispered the character", async () => {
    await session({}, async (handle) => {
      expect(handle.getReplyTarget()).toBeUndefined();
      await next(handle, () => handle.sendSay("hello"));
      expect(handle.getReplyTarget()).toBeUndefined();
      const whisper = await next(handle, () =>
        handle.sendWhisper("Someone", "hey"),
      );
      expect(whisper.type).toBe(ChatType.WHISPER);
      expect(handle.getReplyTarget()).toBe(FIXTURE_CHARACTER);
    });
  });
});
