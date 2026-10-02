import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { GuildInfo } from "#wow/areas/guildadmin/protocol";
import type {
  GuildadminEvent,
  GuildadminStore,
} from "#wow/areas/guildadmin/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const GUILDADMIN_ANSWER_MS = 5000;

export type GuildadminInfoResult = GuildInfo | { status: "no_reply" };
export type GuildadminDisbandResult =
  | { status: "disbanded" }
  | { status: "refused" }
  | { status: "no_reply" };

export type GuildadminActs = {
  info: () => Promise<GuildadminInfoResult>;
  disband: (init: { confirm: boolean }) => Promise<GuildadminDisbandResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<GuildadminEvent>;
  store: GuildadminStore;
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function info(env: Env): Promise<GuildadminInfoResult> {
  const cancel = new AbortController();
  const reply = env.ctx.until((event) => event.type === "info", {
    signal: AbortSignal.any([env.ctx.signal, cancel.signal]),
    timeoutMs: GUILDADMIN_ANSWER_MS,
  });
  reply.catch(ignoreFailure);
  try {
    env.ctx.send(GameOpcode.CMSG_GUILD_INFO);
  } catch (error) {
    cancel.abort();
    throw error;
  }
  try {
    const event = await reply;
    if (event.type !== "info") return { status: "no_reply" };
    return event.info;
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return { status: "no_reply" };
  }
}

async function disband(
  env: Env,
  init: { confirm: boolean },
): Promise<GuildadminDisbandResult> {
  if (!init.confirm) return { status: "refused" };
  const cancel = new AbortController();
  const reply = env.ctx.until((event) => event.type === "disbanded", {
    signal: AbortSignal.any([env.ctx.signal, cancel.signal]),
    timeoutMs: GUILDADMIN_ANSWER_MS,
  });
  reply.catch(ignoreFailure);
  try {
    env.ctx.send(GameOpcode.CMSG_GUILD_DISBAND);
  } catch (error) {
    cancel.abort();
    throw error;
  }
  try {
    await reply;
    return { status: "disbanded" };
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return { status: "no_reply" };
  }
}

export function guildadminRuntime(
  ctx: AreaRuntimeCtx<GuildadminEvent>,
  store: GuildadminStore,
  _core: CoreStores,
): AreaRuntime<GuildadminActs> {
  const env = { ctx, store };
  return {
    act: {
      disband: (init) => disband(env, init),
      info: () => info(env),
    },
    dispose: () => undefined,
  };
}
