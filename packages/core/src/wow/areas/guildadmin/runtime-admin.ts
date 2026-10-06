import {
  buildGuildAddRank,
  buildGuildInfoText,
  buildGuildNote,
  buildGuildRank,
  buildSaveGuildEmblem,
  buildTabardVendor,
  GUILD_INFO_TEXT_MAX,
  GUILD_NOTE_MAX,
  GUILD_RANK_NAME_MAX,
  GUILD_RANKS_MAX,
  GUILD_RANKS_MIN,
  type GuildEmblemSpec,
  type GuildEventLogEntry,
  type GuildPermissions,
  type GuildRankSpec,
} from "#wow/areas/guildadmin/protocol";
import { type GuildadminCtx, request } from "#wow/areas/guildadmin/request";
import type {
  GuildadminRoster,
  GuildadminStore,
} from "#wow/areas/guildadmin/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type GuildadminRefusal = {
  status: "refused";
  reason: string;
};

export type GuildadminNoReply = { status: "no_reply" };
export type GuildadminDenied = { status: "denied"; result: number };

export type GuildadminPermissionsResult =
  | { status: "ok"; permissions: GuildPermissions }
  | GuildadminNoReply;
export type GuildadminEventLogResult =
  | { status: "ok"; entries: GuildEventLogEntry[] }
  | GuildadminNoReply;
export type GuildadminRankResult =
  | { status: "updated"; rank: number; name: string; count: number }
  | GuildadminDenied
  | GuildadminRefusal
  | GuildadminNoReply;
export type GuildadminRemoveRankResult =
  | { status: "removed"; count: number }
  | GuildadminRefusal
  | GuildadminNoReply;
export type GuildadminNoteResult =
  | { status: "set" }
  | GuildadminDenied
  | GuildadminRefusal
  | GuildadminNoReply;
export type GuildadminInfoTextResult =
  | { status: "set" }
  | { status: "rejected"; current: string }
  | GuildadminRefusal
  | GuildadminNoReply;
export type GuildadminEmblemResult =
  | { status: "saved" }
  | { status: "failed"; code: number }
  | GuildadminNoReply;
export type GuildadminTabardResult =
  | { status: "opened"; npc: bigint }
  | GuildadminNoReply;

type Env = { ctx: GuildadminCtx; store: GuildadminStore };

const NO_REPLY: GuildadminNoReply = { status: "no_reply" };

function refuse(reason: string): GuildadminRefusal {
  return { status: "refused", reason };
}

function rankCount(env: Env): number | undefined {
  return env.store.rankCount();
}

function validName(name: string, max: number): string | undefined {
  if (name.length === 0) return "the name is empty";
  if (name.length > max) return `the name is longer than ${max} characters`;
  return undefined;
}

export async function permissions(
  env: Env,
): Promise<GuildadminPermissionsResult> {
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.MSG_GUILD_PERMISSIONS),
    (e) => e.type === "permissions",
  );
  if (event?.type !== "permissions") return NO_REPLY;
  return { status: "ok", permissions: event.permissions };
}

export async function eventLog(env: Env): Promise<GuildadminEventLogResult> {
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.MSG_GUILD_EVENT_LOG_QUERY),
    (e) => e.type === "event_log",
  );
  if (event?.type !== "event_log") return NO_REPLY;
  return { status: "ok", entries: event.entries };
}

export async function addRank(
  env: Env,
  name: string,
): Promise<GuildadminRankResult> {
  const invalid = validName(name, GUILD_RANK_NAME_MAX);
  if (invalid) return refuse(invalid);
  const count = rankCount(env);
  if (count !== undefined && count >= GUILD_RANKS_MAX) {
    return refuse(`the guild already has ${GUILD_RANKS_MAX} ranks`);
  }
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.CMSG_GUILD_ADD_RANK, buildGuildAddRank(name)),
    (e) => e.type === "rank_updated" || e.type === "command_error",
  );
  if (event?.type === "rank_updated") {
    return {
      status: "updated",
      rank: event.rank,
      name: event.name,
      count: event.count,
    };
  }
  if (event?.type === "command_error") {
    return { status: "denied", result: event.result };
  }
  return NO_REPLY;
}

export async function setRank(
  env: Env,
  rankId: number,
  spec: GuildRankSpec,
): Promise<GuildadminRankResult> {
  const invalid = validName(spec.name, GUILD_RANK_NAME_MAX);
  if (invalid) return refuse(invalid);
  const count = rankCount(env);
  if (count !== undefined && rankId >= count) {
    return refuse(`the guild has only ${count} ranks`);
  }
  const event = await request(
    env.ctx,
    () =>
      env.ctx.send(GameOpcode.CMSG_GUILD_RANK, buildGuildRank(rankId, spec)),
    (e) =>
      (e.type === "rank_updated" && e.rank === rankId) ||
      e.type === "command_error",
  );
  if (event?.type === "rank_updated") {
    return {
      status: "updated",
      rank: event.rank,
      name: event.name,
      count: event.count,
    };
  }
  if (event?.type === "command_error") {
    return { status: "denied", result: event.result };
  }
  return NO_REPLY;
}

export async function removeLowestRank(
  env: Env,
  init: { confirm: boolean },
): Promise<GuildadminRemoveRankResult> {
  if (!init.confirm) return refuse("removing a rank needs confirm");
  const count = rankCount(env);
  if (count !== undefined && count <= GUILD_RANKS_MIN) {
    return refuse(`the guild cannot go below ${GUILD_RANKS_MIN} ranks`);
  }
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.CMSG_GUILD_DEL_RANK),
    (e) => e.type === "rank_deleted",
  );
  if (event?.type !== "rank_deleted") return NO_REPLY;
  return { status: "removed", count: event.count };
}

export async function setNote(
  env: Env,
  name: string,
  note: string,
  init: { officer: boolean },
): Promise<GuildadminNoteResult> {
  const invalid = validName(name, 12);
  if (invalid) return refuse(invalid);
  if (note.length > GUILD_NOTE_MAX) {
    return refuse(`the note is longer than ${GUILD_NOTE_MAX} characters`);
  }
  const opcode = init.officer
    ? GameOpcode.CMSG_GUILD_SET_OFFICER_NOTE
    : GameOpcode.CMSG_GUILD_SET_PUBLIC_NOTE;
  const event = await request(
    env.ctx,
    () => env.ctx.send(opcode, buildGuildNote(name, note)),
    (e) => e.type === "roster" || e.type === "command_error",
  );
  if (event?.type === "roster") return { status: "set" };
  if (event?.type === "command_error") {
    return { status: "denied", result: event.result };
  }
  return NO_REPLY;
}

function infoMatches(roster: GuildadminRoster, text: string): boolean {
  return roster.info === text;
}

export async function setInfoText(
  env: Env,
  text: string,
): Promise<GuildadminInfoTextResult> {
  if (text.length > GUILD_INFO_TEXT_MAX) {
    return refuse(`the text is longer than ${GUILD_INFO_TEXT_MAX} characters`);
  }
  const event = await request(
    env.ctx,
    () => {
      env.ctx.send(GameOpcode.CMSG_GUILD_INFO_TEXT, buildGuildInfoText(text));
      env.ctx.send(GameOpcode.CMSG_GUILD_ROSTER);
    },
    (e) => e.type === "roster",
  );
  if (event?.type !== "roster") return NO_REPLY;
  if (infoMatches(event.roster, text)) return { status: "set" };
  return { status: "rejected", current: event.roster.info };
}

export async function saveEmblem(
  env: Env,
  npc: bigint,
  emblem: GuildEmblemSpec,
): Promise<GuildadminEmblemResult> {
  const event = await request(
    env.ctx,
    () =>
      env.ctx.send(
        GameOpcode.MSG_SAVE_GUILD_EMBLEM,
        buildSaveGuildEmblem(npc, emblem),
      ),
    (e) => e.type === "emblem_result",
  );
  if (event?.type !== "emblem_result") return NO_REPLY;
  return event.code === 0
    ? { status: "saved" }
    : { status: "failed", code: event.code };
}

export async function openTabardVendor(
  env: Env,
  npc: bigint,
): Promise<GuildadminTabardResult> {
  const event = await request(
    env.ctx,
    () =>
      env.ctx.send(
        GameOpcode.MSG_TABARDVENDOR_ACTIVATE,
        buildTabardVendor(npc),
      ),
    (e) => e.type === "tabard_vendor",
  );
  if (event?.type !== "tabard_vendor") return NO_REPLY;
  return { status: "opened", npc: event.npc };
}
