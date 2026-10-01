import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLfgBootVote,
  buildLfgProposalResult,
  buildLfgTeleport,
} from "#wow/areas/lfg/protocol";
import type { LfgEvent, LfgStore } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const LFG_ANSWER_TIMEOUT_MS = 5000;
export const LFG_TELEPORT_TIMEOUT_MS = 10_000;

const NOT_IN_LFG_GROUP = 6;
const PLAYER_DEAD = 1;
const COMBAT = 8;

type Ctx = AreaRuntimeCtx<LfgEvent>;

export type LfgAnswerResult =
  | { status: "ok"; state: number }
  | { status: "refused"; reason: string }
  | { status: "no_answer" };
export type LfgTeleportResult =
  | { status: "ok" }
  | { status: "refused"; reason: string; code?: number }
  | { status: "no_answer" };
export type LfgVoteResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "no_answer" };

export type LfgGroupActs = {
  answerProposal: (accept: boolean) => Promise<LfgAnswerResult>;
  teleport: (
    out: boolean,
    options?: { force?: boolean },
  ) => Promise<LfgTeleportResult>;
  voteKick: (agree: boolean) => Promise<LfgVoteResult>;
};

export function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

export async function reply(
  ctx: Ctx,
  match: (event: LfgEvent) => boolean,
  send: () => void,
): Promise<LfgEvent> {
  const cancel = new AbortController();
  const wait = ctx.until(match, {
    timeoutMs: LFG_ANSWER_TIMEOUT_MS,
    signal: cancel.signal,
  });
  try {
    send();
  } catch (error) {
    cancel.abort();
    wait.catch(ignoreFailure);
    throw error;
  }
  try {
    return await wait;
  } finally {
    cancel.abort();
  }
}

async function answerProposal(
  ctx: Ctx,
  store: LfgStore,
  accept: boolean,
): Promise<LfgAnswerResult> {
  const current = store.snapshot().proposal;
  if (current === undefined)
    return { status: "refused", reason: "no_proposal" };
  if (ctx.now() >= current.deadline)
    return { status: "refused", reason: "expired" };
  const { id } = current;
  try {
    const answered = await reply(
      ctx,
      (event) =>
        event.type === "proposal" &&
        event.id === id &&
        (event.state !== 0 || acknowledges(event, accept)),
      () =>
        ctx.send(
          GameOpcode.CMSG_LFG_PROPOSAL_RESULT,
          buildLfgProposalResult(id, accept),
        ),
    );
    if (answered.type !== "proposal") return { status: "ok", state: 0 };
    if (answered.state === 1 && !acknowledges(answered, accept))
      return { status: "refused", reason: "proposal_failed" };
    return { status: "ok", state: answered.state };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

function acknowledges(
  event: Extract<LfgEvent, { type: "proposal" }>,
  accept: boolean,
): boolean {
  return event.selfAnswered && event.selfAccepted === accept;
}

async function voteKick(
  ctx: Ctx,
  store: LfgStore,
  agree: boolean,
): Promise<LfgVoteResult> {
  const boot = store.snapshot().boot;
  if (boot === undefined) return { status: "refused", reason: "no_vote" };
  if (boot.didVote) return { status: "refused", reason: "already_voted" };
  try {
    await reply(
      ctx,
      (event) => event.type === "boot_vote",
      () =>
        ctx.send(GameOpcode.CMSG_LFG_SET_BOOT_VOTE, buildLfgBootVote(agree)),
    );
    return { status: "ok" };
  } catch (error) {
    if (isTimeout(error)) return { status: "ok" };
    throw error;
  }
}

function teleportRefusal(
  ctx: Ctx,
  store: LfgStore,
  core: CoreStores,
): LfgTeleportResult | undefined {
  if (ctx.legacy.party().dungeonFinder === undefined)
    return {
      status: "refused",
      reason: "not_in_lfg_group",
      code: NOT_IN_LFG_GROUP,
    };
  const life = core.recovery.life().life;
  if (life === "dead" || life === "ghost")
    return { status: "refused", reason: "dead", code: PLAYER_DEAD };
  if (store.selfInCombat())
    return { status: "refused", reason: "in_combat", code: COMBAT };
  return undefined;
}

function arrival(
  core: CoreStores,
  signal: AbortSignal,
): Promise<LfgTeleportResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const off = core.self.onEvent((event) => {
      if (
        event.type !== "new_world" &&
        event.type !== "login_verified" &&
        event.type !== "near_teleport"
      )
        return;
      finish();
      resolve({ status: "ok" });
    });
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    function finish(): void {
      off();
      signal.removeEventListener("abort", abort);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function teleportReply(
  ctx: Ctx,
  core: CoreStores,
  send: () => void,
): Promise<LfgTeleportResult> {
  const scope = new AbortController();
  const signal = AbortSignal.any([scope.signal, ctx.signal]);
  const denied = ctx
    .until((event) => event.type === "teleport_denied", {
      timeoutMs: LFG_TELEPORT_TIMEOUT_MS,
      signal,
    })
    .then((event): LfgTeleportResult => {
      if (event.type !== "teleport_denied")
        throw new Error("teleport wait matched another event");
      return { status: "refused", reason: event.reason, code: event.code };
    });
  const moved = arrival(core, signal);
  denied.catch(ignoreFailure);
  moved.catch(ignoreFailure);
  try {
    send();
  } catch (error) {
    scope.abort();
    throw error;
  }
  try {
    return await Promise.race([denied, moved]);
  } finally {
    scope.abort();
  }
}

type TeleportEnv = { ctx: Ctx; store: LfgStore; core: CoreStores };

async function teleport(
  { ctx, store, core }: TeleportEnv,
  out: boolean,
  options: { force?: boolean } | undefined,
): Promise<LfgTeleportResult> {
  if (options?.force !== true) {
    const refusal = teleportRefusal(ctx, store, core);
    if (refusal !== undefined) return refusal;
  }
  try {
    return await teleportReply(ctx, core, () =>
      ctx.send(GameOpcode.CMSG_LFG_TELEPORT, buildLfgTeleport(out)),
    );
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

export function lfgGroupActs(
  ctx: Ctx,
  store: LfgStore,
  core: CoreStores,
  run: <T>(body: () => Promise<T>) => Promise<T>,
): LfgGroupActs {
  return {
    answerProposal: (accept) => run(() => answerProposal(ctx, store, accept)),
    teleport: (out, options) =>
      run(() => teleport({ ctx, store, core }, out, options)),
    voteKick: (agree) => run(() => voteKick(ctx, store, agree)),
  };
}
