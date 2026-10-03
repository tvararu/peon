import {
  type ChatMessage,
  ChatType,
  type DuelEvent,
  type GroupEvent,
} from "@peon/core";
import type { LogClass, LogDraft, LogEvent } from "#harness/contract/log";
import type { Drafts, RuleInput } from "#harness/events/rules";

const WAKE_TYPES = new Set<number>([
  ChatType.WHISPER,
  ChatType.WHISPER_FOREIGN,
  ChatType.PARTY,
  ChatType.PARTY_LEADER,
  ChatType.RAID,
  ChatType.RAID_LEADER,
  ChatType.RAID_WARNING,
  ChatType.GUILD,
  ChatType.OFFICER,
]);
const OPEN_TYPES = new Set<number>([ChatType.SAY, ChatType.YELL]);
const PASSIVE_TYPES = new Set<number>([
  ChatType.EMOTE,
  ChatType.MONSTER_SAY,
  ChatType.MONSTER_PARTY,
  ChatType.MONSTER_YELL,
  ChatType.MONSTER_WHISPER,
  ChatType.MONSTER_EMOTE,
  ChatType.RAID_BOSS_EMOTE,
  ChatType.RAID_BOSS_WHISPER,
]);
const WHISPERS = new Set<number>([ChatType.WHISPER, ChatType.WHISPER_FOREIGN]);
const EMOTES = new Set<number>([ChatType.EMOTE, ChatType.MONSTER_EMOTE]);
const TAGS = new Map<number, string>([
  [ChatType.PARTY, "party"],
  [ChatType.PARTY_LEADER, "party"],
  [ChatType.RAID, "raid"],
  [ChatType.RAID_LEADER, "raid"],
  [ChatType.RAID_WARNING, "raid warning"],
  [ChatType.GUILD, "guild"],
  [ChatType.OFFICER, "officer"],
]);
const VERBS = new Map<number, string>([
  [ChatType.YELL, "yells"],
  [ChatType.MONSTER_YELL, "yells"],
  [ChatType.MONSTER_WHISPER, "whispers"],
]);
const QUIET_SYSTEM =
  /not yet implemented|^\[debug\]|^(This server|Playerbots:|Individual Progression|Joined channel|Left channel|Welcome|Accepting Whisper)/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const COLOUR_CODES = /\|c[0-9a-fA-F]{8}|\|r|\|H[^|]*\|h|\|h/g;

type GroupRow = {
  cls: LogClass;
  event: LogEvent;
  text: string;
  data?: Record<string, unknown>;
};

function namesMe(text: string, name: string): boolean {
  const escaped = name.replace(REGEX_SPECIALS, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function chatClass({ type, message }: ChatMessage, rc: RuleInput): LogClass {
  if (WAKE_TYPES.has(type)) return "wake";
  if (OPEN_TYPES.has(type))
    return namesMe(message, rc.selfName) ? "wake" : "passive";
  if (PASSIVE_TYPES.has(type)) return "passive";
  if (type === ChatType.SYSTEM)
    return QUIET_SYSTEM.test(message) ? "log" : "passive";
  return "log";
}

function chatText({ type, sender, message, channel }: ChatMessage): string {
  if (WHISPERS.has(type)) return `Whisper from ${sender}: "${message}"`;
  if (type === ChatType.SYSTEM) return `[system] ${message}`;
  if (EMOTES.has(type)) return `${sender} ${message}`;
  const tag = TAGS.get(type) ?? channel;
  if (tag) return `[${tag}] ${sender}: "${message}"`;
  return `${sender} ${VERBS.get(type) ?? "says"}: "${message}"`;
}

function chatOut(data: Record<string, unknown>, text: string): LogDraft {
  return { class: "log", data, domain: "chat", event: "chat/out", text };
}

function stripColourCodes(text: string): string {
  return text.replace(COLOUR_CODES, "");
}

export function chatDrafts(raw: ChatMessage, rc: RuleInput): Drafts {
  const msg = { ...raw, message: stripColourCodes(raw.message) };
  const { channel, message, sender, type } = msg;
  const base = { channel, sender, text: message, type };
  if (type === ChatType.WHISPER_INFORM)
    return [
      chatOut(
        { ...base, self: true, to: sender },
        `You whisper to ${sender}: "${message}"`,
      ),
    ];
  if (sender === rc.selfName)
    return [chatOut({ ...base, self: true }, chatText(msg))];
  const data = { ...base, self: false };
  return [
    {
      class: chatClass(msg, rc),
      data,
      domain: "chat",
      event: "chat/in",
      text: chatText(msg),
    },
  ];
}
function groupRow(event: GroupEvent, rc: RuleInput): GroupRow | undefined {
  switch (event.type) {
    case "invite_received":
      return {
        cls: "wake",
        data: { from: event.from },
        event: "group/invite",
        text: `${event.from} invites you to a group.`,
      };
    case "kicked":
      return {
        cls: "wake",
        event: "group/kicked",
        text: "You were removed from the group.",
      };
    case "group_destroyed":
      return {
        cls: "wake",
        event: "group/disbanded",
        text: "Your group was disbanded.",
      };
    case "group_list": {
      const members = event.members.map((member) => member.name);
      const text = `Group: ${members.join(", ")}; leader ${event.leader}.`;
      const data = { leader: event.leader, members };
      return { cls: "passive", data, event: "group/roster", text };
    }
    case "leader_changed": {
      const self = event.name === rc.selfName;
      return {
        cls: self ? "wake" : "passive",
        data: self ? {} : { leader: event.name },
        event: "group/roster",
        text: self
          ? "You lead the group now."
          : `${event.name} is now the group leader.`,
      };
    }
    case "invite_declined":
      return {
        cls: "passive",
        data: { declined: event.name },
        event: "group/roster",
        text: `${event.name} declined your group invite.`,
      };
    default:
      return undefined;
  }
}
export function groupDrafts(event: GroupEvent, rc: RuleInput): Drafts {
  const row = groupRow(event, rc);
  if (!row) return [];
  const { cls, event: name, text, data = {} } = row;
  return [{ class: cls, data, domain: "group", event: name, text }];
}

export function duelDrafts(event: DuelEvent, _rc: RuleInput): Drafts {
  if (event.type !== "duel_requested") return [];
  const { challenger } = event;
  const text = `${challenger} challenges you to a duel.`;
  return [
    {
      class: "wake",
      data: { challenger },
      domain: "social",
      event: "social/duel_request",
      text,
    },
  ];
}
