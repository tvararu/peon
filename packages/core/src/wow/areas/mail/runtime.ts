import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildGetMailList,
  buildMailMarkAsRead,
  buildQueryNextMailTime,
} from "#wow/areas/mail/protocol";
import {
  MAIL_CREATURE_YARDS,
  MAIL_OBJECT_YARDS,
  type MailEvent,
  type MailStore,
} from "#wow/areas/mail/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const MAIL_ANSWER_MS = 5000;

export type MailListResult = { status: "ok" } | { status: "unanswered" };
export type MailMarkResult = { status: "ok" };
export type MailNextResult =
  | { status: "ok"; unread: boolean }
  | { status: "unanswered" };

export type MailActs = {
  listMail: (mailbox: bigint) => Promise<MailListResult>;
  markMailRead: (id: number) => Promise<MailMarkResult>;
  queryNextMail: () => Promise<MailNextResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<MailEvent>;
  store: MailStore;
};

function requireWorld(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function requireMailbox(env: Env, mailbox: bigint): void {
  const reach = env.store.reach(mailbox);
  if (!reach) throw new Error("no_mailbox");
  const limit =
    reach.kind === "object" ? MAIL_OBJECT_YARDS : MAIL_CREATURE_YARDS;
  if (reach.distance > limit) throw new Error("no_mailbox");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function listMail(env: Env, mailbox: bigint): Promise<MailListResult> {
  requireWorld(env);
  requireMailbox(env, mailbox);
  const cancel = new AbortController();
  const settled = env.ctx.until((event) => event.type === "listed", {
    signal: cancel.signal,
    timeoutMs: MAIL_ANSWER_MS,
  });
  try {
    env.ctx.send(GameOpcode.CMSG_GET_MAIL_LIST, buildGetMailList(mailbox));
  } catch (error) {
    cancel.abort();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    await settled;
    env.store.openMailbox(mailbox);
    return { status: "ok" };
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

async function markMailRead(env: Env, id: number): Promise<MailMarkResult> {
  requireWorld(env);
  const mailbox = env.store.snapshot().mailbox;
  if (mailbox === undefined) throw new Error("no_mailbox");
  requireMailbox(env, mailbox);
  await Promise.resolve();
  env.ctx.send(
    GameOpcode.CMSG_MAIL_MARK_AS_READ,
    buildMailMarkAsRead(mailbox, id),
  );
  return { status: "ok" };
}

async function queryNextMail(env: Env): Promise<MailNextResult> {
  requireWorld(env);
  const cancel = new AbortController();
  const settled = env.ctx.until((event) => event.type === "next_time", {
    signal: cancel.signal,
    timeoutMs: MAIL_ANSWER_MS,
  });
  try {
    env.ctx.send(GameOpcode.MSG_QUERY_NEXT_MAIL_TIME, buildQueryNextMailTime());
  } catch (error) {
    cancel.abort();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    const event = await settled;
    if (event.type !== "next_time") return { status: "unanswered" };
    return { status: "ok", unread: event.unread };
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

export function mailRuntime(
  ctx: AreaRuntimeCtx<MailEvent>,
  store: MailStore,
  _core: CoreStores,
): AreaRuntime<MailActs> {
  const env = { ctx, store };
  return {
    act: {
      listMail: (mailbox) => listMail(env, mailbox),
      markMailRead: (id) => markMailRead(env, id),
      queryNextMail: () => queryNextMail(env),
    },
    dispose: () => undefined,
  };
}
