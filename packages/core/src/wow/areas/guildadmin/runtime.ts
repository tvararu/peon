import type { AreaRuntime } from "#wow/areas/contract";
import type {
  GuildEmblemSpec,
  GuildInfo,
  GuildRankSpec,
} from "#wow/areas/guildadmin/protocol";
import { type GuildadminCtx, request } from "#wow/areas/guildadmin/request";
import {
  addRank,
  eventLog,
  type GuildadminEmblemResult,
  type GuildadminEventLogResult,
  type GuildadminInfoTextResult,
  type GuildadminNoteResult,
  type GuildadminPermissionsResult,
  type GuildadminRankResult,
  type GuildadminRemoveRankResult,
  type GuildadminTabardResult,
  openTabardVendor,
  permissions,
  removeLowestRank,
  saveEmblem,
  setInfoText,
  setNote,
  setRank,
} from "#wow/areas/guildadmin/runtime-admin";
import type { GuildadminStore } from "#wow/areas/guildadmin/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export type GuildadminInfoResult = GuildInfo | { status: "no_reply" };
export type GuildadminDisbandResult =
  | { status: "disbanded" }
  | { status: "refused" }
  | { status: "no_reply" };

export type GuildadminActs = {
  info: () => Promise<GuildadminInfoResult>;
  disband: (init: { confirm: boolean }) => Promise<GuildadminDisbandResult>;
  permissions: () => Promise<GuildadminPermissionsResult>;
  eventLog: () => Promise<GuildadminEventLogResult>;
  addRank: (name: string) => Promise<GuildadminRankResult>;
  setRank: (
    rankId: number,
    spec: GuildRankSpec,
  ) => Promise<GuildadminRankResult>;
  removeLowestRank: (init: {
    confirm: boolean;
  }) => Promise<GuildadminRemoveRankResult>;
  setNote: (
    name: string,
    note: string,
    init: { officer: boolean },
  ) => Promise<GuildadminNoteResult>;
  setInfoText: (text: string) => Promise<GuildadminInfoTextResult>;
  saveEmblem: (
    npc: bigint,
    emblem: GuildEmblemSpec,
  ) => Promise<GuildadminEmblemResult>;
  openTabardVendor: (npc: bigint) => Promise<GuildadminTabardResult>;
};

type Env = { ctx: GuildadminCtx; store: GuildadminStore };

async function info(env: Env): Promise<GuildadminInfoResult> {
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.CMSG_GUILD_INFO),
    (e) => e.type === "info",
  );
  if (event?.type !== "info") return { status: "no_reply" };
  return event.info;
}

async function disband(
  env: Env,
  init: { confirm: boolean },
): Promise<GuildadminDisbandResult> {
  if (!init.confirm) return { status: "refused" };
  const event = await request(
    env.ctx,
    () => env.ctx.send(GameOpcode.CMSG_GUILD_DISBAND),
    (e) => e.type === "disbanded",
  );
  return event ? { status: "disbanded" } : { status: "no_reply" };
}

export function guildadminRuntime(
  ctx: GuildadminCtx,
  store: GuildadminStore,
  _core: CoreStores,
): AreaRuntime<GuildadminActs> {
  const env = { ctx, store };
  return {
    act: {
      addRank: (name) => addRank(env, name),
      disband: (init) => disband(env, init),
      eventLog: () => eventLog(env),
      info: () => info(env),
      openTabardVendor: (npc) => openTabardVendor(env, npc),
      permissions: () => permissions(env),
      removeLowestRank: (init) => removeLowestRank(env, init),
      saveEmblem: (npc, emblem) => saveEmblem(env, npc, emblem),
      setInfoText: (text) => setInfoText(env, text),
      setNote: (name, note, init) => setNote(env, name, note, init),
      setRank: (rankId, spec) => setRank(env, rankId, spec),
    },
    dispose: () => undefined,
  };
}
