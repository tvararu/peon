import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildGetMailList,
  buildMailCreateTextItem,
  buildMailDelete,
  buildMailMarkAsRead,
  buildMailReturnToSender,
  buildMailTakeItem,
  buildMailTakeMoney,
  buildQueryNextMailTime,
  buildSendMail,
  MAX_MAIL_ITEMS,
  type MailDraft,
  type MailDraftItem,
  type SendMailResult,
} from "#wow/areas/mail/protocol";
import {
  MAIL_CREATURE_YARDS,
  MAIL_OBJECT_YARDS,
  type MailEvent,
  type MailStore,
} from "#wow/areas/mail/store";
import { readInventory } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const MAIL_ANSWER_MS = 5000;

export type MailListResult = { status: "ok" } | { status: "unanswered" };
export type MailMarkResult = { status: "ok" };
export type MailNextResult =
  | { status: "ok"; unread: boolean }
  | { status: "unanswered" };

export type MailActResult =
  | { status: "ok"; itemLow?: number }
  | { status: "refused"; why: string }
  | { status: "unanswered" };

export type MailTakeItemOpts = { payCod?: boolean };

export type MailSendOpts = {
  mailbox?: bigint;
  receiver: string;
  subject: string;
  body: string;
  stationery?: number;
  items?: readonly MailDraftItem[];
  money?: number;
  cod?: number;
};

export type MailActs = {
  listMail: (mailbox: bigint) => Promise<MailListResult>;
  markMailRead: (id: number) => Promise<MailMarkResult>;
  queryNextMail: () => Promise<MailNextResult>;
  takeMailMoney: (id: number) => Promise<MailActResult>;
  takeMailItem: (
    id: number,
    itemLow: number,
    opts?: MailTakeItemOpts,
  ) => Promise<MailActResult | { status: "sent" }>;
  returnMail: (id: number) => Promise<MailActResult>;
  deleteMail: (id: number) => Promise<MailActResult>;
  copyMailText: (id: number) => Promise<MailActResult>;
  sendMail: (opts: MailSendOpts) => Promise<MailActResult>;
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

function selfName(env: Env): string | undefined {
  const guid = env.ctx.selfGuid();
  if (!guid) return undefined;
  return env.store.entityOf(guid)?.name ?? undefined;
}

function coinage(env: Env): number | undefined {
  const guid = env.ctx.selfGuid();
  if (!guid) return undefined;
  return readInventory(guid, env.store.entityOf).coinage;
}

function actMailbox(env: Env): bigint {
  const mailbox = env.store.snapshot().mailbox;
  if (mailbox === undefined) throw new Error("no_mailbox");
  requireMailbox(env, mailbox);
  return mailbox;
}

function settleResult(result: SendMailResult): MailActResult {
  if (result.status === "ok")
    return "itemLow" in result && result.itemLow !== undefined
      ? { itemLow: result.itemLow, status: "ok" }
      : { status: "ok" };
  return { status: "refused", why: result.status };
}

async function runAct(
  env: Env,
  pending: Parameters<MailStore["beginAction"]>[0],
  opcode: number,
  body: Uint8Array,
  match: (result: SendMailResult) => boolean,
): Promise<MailActResult> {
  env.store.beginAction(pending);
  const cancel = new AbortController();
  const settled = env.ctx.until(
    (event) => event.type === "result" && match(event.result),
    { signal: cancel.signal, timeoutMs: MAIL_ANSWER_MS },
  );
  try {
    env.ctx.send(opcode, body);
  } catch (error) {
    cancel.abort();
    settled.catch(ignoreFailure);
    env.store.releaseAction();
    throw error;
  }
  try {
    const event = await settled;
    if (event.type !== "result") return { status: "unanswered" };
    return settleResult(event.result);
  } catch (error) {
    if (!isTimeout(error)) throw error;
    env.store.releaseAction();
    return { status: "unanswered" };
  }
}

async function takeMailMoney(env: Env, id: number): Promise<MailActResult> {
  requireWorld(env);
  const mailbox = actMailbox(env);
  const mail = env.store.snapshot().inbox.find((row) => row.id === id);
  if (!mail) throw new Error("no_such_mail");
  return runAct(
    env,
    { action: "money_taken", id },
    GameOpcode.CMSG_MAIL_TAKE_MONEY,
    buildMailTakeMoney(mailbox, id),
    (result) => result.action === "money_taken" && result.id === id,
  );
}

async function takeMailItem(
  env: Env,
  id: number,
  itemLow: number,
  opts?: MailTakeItemOpts,
): Promise<MailActResult | { status: "sent" }> {
  requireWorld(env);
  const mailbox = actMailbox(env);
  const mail = env.store.snapshot().inbox.find((row) => row.id === id);
  if (!mail) throw new Error("no_such_mail");
  const found = mail.items.some((item) => item.guidLow === itemLow);
  if (!found) throw new Error("no_such_item");
  if (mail.cod > 0 && opts?.payCod !== true) throw new Error("cod_unpaid");
  if (
    mail.cod > 0 &&
    coinage(env) !== undefined &&
    mail.cod > (coinage(env) ?? 0)
  )
    throw new Error("cod_unpaid");
  const body = buildMailTakeItem(mailbox, id, itemLow);
  return runAct(
    env,
    { action: "item_taken", id },
    GameOpcode.CMSG_MAIL_TAKE_ITEM,
    body,
    (result) => result.action === "item_taken" && result.id === id,
  );
}

async function returnMail(env: Env, id: number): Promise<MailActResult> {
  requireWorld(env);
  const mailbox = actMailbox(env);
  const mail = env.store.snapshot().inbox.find((row) => row.id === id);
  if (!mail) throw new Error("no_such_mail");
  if (mail.sender.kind !== "player") throw new Error("no_sender");
  return runAct(
    env,
    { action: "returned_to_sender", id },
    GameOpcode.CMSG_MAIL_RETURN_TO_SENDER,
    buildMailReturnToSender(mailbox, id, mail.sender.guid),
    (result) => result.action === "returned_to_sender" && result.id === id,
  );
}

async function deleteMail(env: Env, id: number): Promise<MailActResult> {
  requireWorld(env);
  const mailbox = actMailbox(env);
  const mail = env.store.snapshot().inbox.find((row) => row.id === id);
  if (!mail) throw new Error("no_such_mail");
  if (mail.money > 0 || mail.items.length > 0)
    throw new Error("mail_not_empty");
  return runAct(
    env,
    { action: "deleted", id },
    GameOpcode.CMSG_MAIL_DELETE,
    buildMailDelete(mailbox, id, mail.template),
    (result) => result.action === "deleted" && result.id === id,
  );
}

async function copyMailText(env: Env, id: number): Promise<MailActResult> {
  requireWorld(env);
  const mailbox = actMailbox(env);
  const mail = env.store.snapshot().inbox.find((row) => row.id === id);
  if (!mail) throw new Error("no_such_mail");
  if (mail.flags.copied) throw new Error("already_copied");
  if (mail.body.length === 0 && mail.template === 0)
    throw new Error("nothing_to_copy");
  return runAct(
    env,
    { action: "made_permanent", id },
    GameOpcode.CMSG_MAIL_CREATE_TEXT_ITEM,
    buildMailCreateTextItem(mailbox, id),
    (result) => result.action === "made_permanent" && result.id === id,
  );
}

const MAIL_SEND_POSTAGE = 30;

function checkSendMail(env: Env, opts: MailSendOpts): MailDraft {
  const mailbox = opts.mailbox ?? env.store.snapshot().mailbox;
  if (mailbox === undefined) throw new Error("no_mailbox");
  requireMailbox(env, mailbox);
  if (opts.receiver.length === 0) throw new Error("no_receiver");
  if (opts.receiver.includes("| |")) throw new Error("bad_text");
  if (opts.subject.includes("| |") || opts.body.includes("| |"))
    throw new Error("bad_text");
  const self = selfName(env);
  if (self !== undefined && opts.receiver === self)
    throw new Error("cannot_send_to_self");
  const items = opts.items ?? [];
  if (items.length > MAX_MAIL_ITEMS) throw new Error("too_many_attachments");
  const money = opts.money ?? 0;
  const cod = opts.cod ?? 0;
  if (money > 0 && cod > 0) throw new Error("cod_with_money");
  const postage =
    items.length > 0 ? MAIL_SEND_POSTAGE * items.length : MAIL_SEND_POSTAGE;
  const have = coinage(env);
  if (have !== undefined && money + postage > have)
    throw new Error("not_enough_money");
  return {
    body: opts.body,
    cod,
    mailbox,
    money,
    receiver: opts.receiver,
    subject: opts.subject,
    ...(opts.stationery === undefined ? {} : { stationery: opts.stationery }),
    ...(items.length === 0 ? {} : { items }),
  };
}

async function sendMail(env: Env, opts: MailSendOpts): Promise<MailActResult> {
  requireWorld(env);
  const draft = checkSendMail(env, opts);
  return runAct(
    env,
    { action: "send", id: 0 },
    GameOpcode.CMSG_SEND_MAIL,
    buildSendMail(draft),
    (result) => result.action === "send" && result.id === 0,
  );
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
      takeMailMoney: (id) => takeMailMoney(env, id),
      takeMailItem: (id, itemLow, opts) => takeMailItem(env, id, itemLow, opts),
      returnMail: (id) => returnMail(env, id),
      deleteMail: (id) => deleteMail(env, id),
      copyMailText: (id) => copyMailText(env, id),
      sendMail: (opts) => sendMail(env, opts),
    },
    dispose: () => undefined,
  };
}
