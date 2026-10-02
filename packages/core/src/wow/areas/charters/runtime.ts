import { ignoreFailure } from "#lib/ignore-failure";
import {
  buildPetitionBuy,
  buildPetitionQuery,
  buildPetitionRename,
  buildShowSignatures,
  buildShowlist,
} from "#wow/areas/charters/protocol";
import {
  type CharterRequest,
  type CharterResult,
  type ChartersEvent,
  type ChartersStore,
} from "#wow/areas/charters/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const CHARTERS_ANSWER_MS = 5000;

export type ChartersActs = {
  showList: (npc: bigint) => Promise<CharterResult>;
  buy: (npc: bigint, name: string, index: number) => Promise<CharterResult>;
  query: (item: bigint) => Promise<CharterResult>;
  showSignatures: (item: bigint) => Promise<CharterResult>;
  rename: (item: bigint, name: string) => Promise<CharterResult>;
};

const SETTLED = new Set<ChartersEvent["type"]>([
  "showlist",
  "query",
  "signatures",
  "renamed",
  "bought",
  "refused",
  "unanswered",
]);

type Env = {
  ctx: AreaRuntimeCtx<ChartersEvent>;
  store: ChartersStore;
};

function requireWorld(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function send(
  env: Env,
  request: CharterRequest,
  packet: readonly [opcode: number, body: Uint8Array],
): Promise<CharterResult> {
  env.store.begin(request);
  const cancel = new AbortController();
  const settled = env.ctx.until(
    (event) =>
      SETTLED.has(event.type) && env.store.resultOf(request) !== undefined,
    {
      signal: AbortSignal.any([env.ctx.signal, cancel.signal]),
      timeoutMs: CHARTERS_ANSWER_MS,
    },
  );
  settled.catch(ignoreFailure);
  try {
    env.ctx.send(...packet);
  } catch (error) {
    cancel.abort();
    env.store.abandon();
    throw error;
  }
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandon();
      throw error;
    }
    if (env.store.snapshot().pending === request) env.store.expire();
  }
  return env.store.takeResult(request) ?? { status: "no_reply" };
}

function showList(env: Env, npc: bigint): Promise<CharterResult> {
  requireWorld(env);
  return send(
    env,
    { kind: "showlist", npc, requestedAt: env.ctx.now() },
    [GameOpcode.CMSG_PETITION_SHOWLIST, buildShowlist(npc)],
  );
}

function buy(
  env: Env,
  npc: bigint,
  name: string,
  index: number,
): Promise<CharterResult> {
  requireWorld(env);
  if (!Number.isInteger(index) || index < 1)
    throw new Error(`charter index ${index} is not a positive integer`);
  if (env.store.petitioner(npc) === false)
    return Promise.resolve({ reason: "not_petitioner", status: "refused" });
  const guild = env.store.guildId();
  if (guild !== undefined && guild !== 0)
    return Promise.resolve({ reason: "in_guild", status: "refused" });
  return send(
    env,
    {
      before: env.store.charterItems(),
      entries: env.store.entriesOf(npc),
      index,
      kind: "buy",
      name,
      npc,
      requestedAt: env.ctx.now(),
    },
    [GameOpcode.CMSG_PETITION_BUY, buildPetitionBuy(npc, index, name)],
  );
}

function query(env: Env, item: bigint): Promise<CharterResult> {
  requireWorld(env);
  return send(
    env,
    {
      item,
      kind: "query",
      petition: env.store.petitionIdOf(item),
      requestedAt: env.ctx.now(),
    },
    [
      GameOpcode.CMSG_PETITION_QUERY,
      buildPetitionQuery(env.store.petitionIdOf(item) ?? 0, item),
    ],
  );
}

function showSignatures(env: Env, item: bigint): Promise<CharterResult> {
  requireWorld(env);
  return send(
    env,
    { item, kind: "signatures", requestedAt: env.ctx.now() },
    [GameOpcode.CMSG_PETITION_SHOW_SIGNATURES, buildShowSignatures(item)],
  );
}

function rename(env: Env, item: bigint, name: string): Promise<CharterResult> {
  requireWorld(env);
  return send(
    env,
    { item, kind: "rename", name, requestedAt: env.ctx.now() },
    [GameOpcode.MSG_PETITION_RENAME, buildPetitionRename(item, name)],
  );
}

export function chartersRuntime(
  ctx: AreaRuntimeCtx<ChartersEvent>,
  store: ChartersStore,
  _core: CoreStores,
): AreaRuntime<ChartersActs> {
  const env = { ctx, store };
  return {
    act: {
      buy: (npc, name, index) => buy(env, npc, name, index),
      query: (item) => query(env, item),
      rename: (item, name) => rename(env, item, name),
      showList: (npc) => showList(env, npc),
      showSignatures: (item) => showSignatures(env, item),
    },
    dispose: () => undefined,
  };
}
