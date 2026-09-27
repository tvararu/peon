import type { ChatMode, WorldHandle } from "#wow/client";
import {
  buildChatMessage,
  buildWhoRequest,
  parseWhoResponse,
} from "#wow/protocol/chat";
import { PLAYER_FIELDS } from "#wow/protocol/entity-fields";
import { ChatType, GameOpcode } from "#wow/protocol/opcodes";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

export const NOT_IN_GUILD_TEXT = "You are not in a guild.";

function guildChat(conn: WorldConn, send: () => void): void {
  const self = conn.entityStore.get(selfGuid(conn));
  const guildId =
    self?.rawFields.get(PLAYER_FIELDS.GUILDID.offset) ?? conn.guildId;
  if (guildId === 0)
    conn.events.message.emit({
      type: ChatType.SYSTEM,
      sender: "",
      message: NOT_IN_GUILD_TEXT,
    });
  else send();
}

export function chatMethods(conn: WorldConn, lang: number) {
  const chat = (type: number, message: string, target?: string): void =>
    sendPacket(
      conn,
      GameOpcode.CMSG_MESSAGE_CHAT,
      buildChatMessage(type, lang, message, target),
    );
  return {
    sendWhisper(target, message) {
      if (target) conn.lastChatMode = { type: "whisper", target };
      chat(ChatType.WHISPER, message, target);
    },
    sendSay(message) {
      conn.lastChatMode = { type: "say" };
      chat(ChatType.SAY, message);
    },
    sendYell(message) {
      conn.lastChatMode = { type: "yell" };
      chat(ChatType.YELL, message);
    },
    sendGuild(message) {
      guildChat(conn, () => {
        conn.lastChatMode = { type: "guild" };
        chat(ChatType.GUILD, message);
      });
    },
    sendOfficer(message) {
      guildChat(conn, () => {
        conn.lastChatMode = { type: "officer" };
        chat(ChatType.OFFICER, message);
      });
    },
    sendParty(message) {
      conn.lastChatMode = { type: "party" };
      chat(ChatType.PARTY, message);
    },
    sendRaid(message) {
      conn.lastChatMode = { type: "raid" };
      chat(ChatType.RAID, message);
    },
    sendEmote(message) {
      conn.lastChatMode = { type: "emote" };
      chat(ChatType.EMOTE, message);
    },
    sendDnd(message) {
      chat(ChatType.DND, message);
    },
    sendAfk(message) {
      chat(ChatType.AFK, message);
    },
    sendChannel(channel, message) {
      conn.lastChatMode = { type: "channel", channel };
      chat(ChatType.CHANNEL, message, channel);
    },
  } satisfies Partial<WorldHandle>;
}

function sendInMode(
  handle: WorldHandle,
  mode: ChatMode,
  message: string,
): void {
  switch (mode.type) {
    case "say":
      handle.sendSay(message);
      break;
    case "yell":
      handle.sendYell(message);
      break;
    case "guild":
      handle.sendGuild(message);
      break;
    case "officer":
      handle.sendOfficer(message);
      break;
    case "party":
      handle.sendParty(message);
      break;
    case "raid":
      handle.sendRaid(message);
      break;
    case "emote":
      handle.sendEmote(message);
      break;
    case "whisper":
      handle.sendWhisper(mode.target, message);
      break;
    case "channel":
      handle.sendChannel(mode.channel, message);
      break;
    default:
      break;
  }
}

export function channelMethods(conn: WorldConn, handle: () => WorldHandle) {
  return {
    getChannel(index) {
      return conn.channels[index - 1];
    },
    getReplyTarget() {
      return conn.lastWhisperFrom;
    },
    async who(opts = {}) {
      sendPacket(conn, GameOpcode.CMSG_WHO, buildWhoRequest(opts));
      const r = await conn.dispatch.expect(GameOpcode.SMSG_WHO);
      return parseWhoResponse(r);
    },
    getLastChatMode() {
      return conn.lastChatMode;
    },
    setLastChatMode(mode) {
      conn.lastChatMode = mode;
    },
    sendInCurrentMode(message) {
      sendInMode(handle(), conn.lastChatMode, message);
    },
  } satisfies Partial<WorldHandle>;
}
