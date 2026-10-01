import type { WorldHandle } from "@peon/core";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 9;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const MAILBOX_OBJECT_TYPE = 19;

type Args = Readonly<Record<string, string>>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`mail-actions needs ${key}=<number>, not "${raw}".`);
  return value;
}

async function reach(handle: WorldHandle, guid: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = others(handle).find((r) => r.entity.guid === guid);
    if (!row?.position || row.distance === null || row.distance <= REACH_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - REACH_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

function brief(handle: WorldHandle): Json {
  const state = handle.mail.state();
  return json({
    hidden: state.hidden,
    inbox: state.inbox.map((mail) => ({
      cod: mail.cod,
      flags: mail.flags.raw,
      id: mail.id,
      items: mail.items.map((item) => ({
        count: item.count,
        entry: item.entry,
      })),
      money: mail.money,
      subject: mail.subject,
      type: mail.type,
    })),
    lastResult: state.lastResult ?? null,
    mailbox: state.mailbox,
    newMail: state.newMail,
  });
}

function findLetter(handle: WorldHandle, id: number | undefined, step: string) {
  const inbox = handle.mail.state().inbox;
  if (id !== undefined) return inbox.find((mail) => mail.id === id);
  if (step === "copy" || step === "delete" || step === "return")
    return inbox.find((mail) => mail.subject === "Some text") ?? inbox[0];
  return inbox.find((mail) => mail.money > 0 || mail.items.length > 0);
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  const entry = whole(args, "entry");
  const id = whole(args, "id");
  const box = await settle(() =>
    others(handle).find((r) => {
      if (entityType(r) !== "gameobject") return false;
      if (entry !== undefined && r.entity.entry !== entry) return false;
      if (r.roles.includes("mailbox")) return true;
      return (
        handle.objects.state().templates.get(r.entity.entry)?.type ===
        MAILBOX_OBJECT_TYPE
      );
    }),
  );
  if (!box) throw new Error("no mailbox is in view.");
  await reach(handle, box.entity.guid);
  const listed = await attempt(() => handle.mail.act.listMail(box.entity.guid));
  const state = handle.mail.state();
  const step = args["do"] ?? "take";
  const letter = findLetter(handle, id, step);
  const target =
    letter === undefined ? null : { id: letter.id, subject: letter.subject };
  if (step === "take") {
    const money =
      letter && letter.money > 0
        ? await attempt(() => handle.mail.act.takeMailMoney(letter.id))
        : { skipped: "no letter with money" };
    const withItems = handle.mail
      .state()
      .inbox.find((mail) => mail.items.length > 0);
    const item =
      withItems === undefined
        ? { skipped: "no letter with items" }
        : await attempt(() =>
            handle.mail.act.takeMailItem(
              withItems.id,
              withItems.items[0]?.guidLow ?? 0,
            ),
          );
    const relisted = await attempt(() =>
      handle.mail.act.listMail(box.entity.guid),
    );
    return json({
      box: summary(box),
      item,
      listed,
      money,
      relisted,
      state: brief(handle),
      target,
    });
  }
  if (step === "copy") {
    const copy =
      letter === undefined
        ? { skipped: "no letter to copy" }
        : await attempt(() => handle.mail.act.copyMailText(letter.id));
    return json({
      box: summary(box),
      copy,
      listed,
      state: brief(handle),
      target,
    });
  }
  if (step === "delete") {
    const removed =
      letter === undefined
        ? { skipped: "no letter to delete" }
        : await attempt(() => handle.mail.act.deleteMail(letter.id));
    const relisted = await attempt(() =>
      handle.mail.act.listMail(box.entity.guid),
    );
    return json({
      box: summary(box),
      listed,
      relisted,
      removed,
      state: brief(handle),
      target,
    });
  }
  if (step === "send") {
    const to = args["to"];
    if (!to) throw new Error("mail-actions needs to=<name> for do=send.");
    const inv = handle.getInventoryState();
    const itemArgs = [args["item0"], args["item1"]]
      .map((raw) => raw?.split(":"))
      .filter(
        (part): part is [string, string] =>
          part !== undefined && part.length === 2,
      );
    const found = itemArgs.map(([guid, slot]) => {
      const row = inv.slots.find(
        (candidate) =>
          candidate.status === "occupied" &&
          candidate.guid === BigInt(guid) &&
          candidate.item.entry === Number(slot),
      );
      if (!row || row.status !== "occupied")
        throw new Error(`no carried item ${guid} entry ${slot}.`);
      return { guid: row.guid, slot: row.slot };
    });
    const sent = await attempt(() =>
      handle.mail.act.sendMail({
        body: args["body"] ?? "",
        receiver: to,
        subject: args["subject"] ?? "Hello",
        ...(args["money"] === undefined
          ? {}
          : { money: Number(args["money"]) }),
        ...(found.length === 0 ? {} : { items: found }),
      }),
    );
    return json({
      box: summary(box),
      listed,
      sent,
      state: brief(handle),
      unread: state.unread,
    });
  }
  if (step === "return") {
    const returned =
      letter === undefined
        ? { skipped: "no letter to return" }
        : await attempt(() => handle.mail.act.returnMail(letter.id));
    const relisted = await attempt(() =>
      handle.mail.act.listMail(box.entity.guid),
    );
    return json({
      box: summary(box),
      listed,
      relisted,
      returned,
      state: brief(handle),
      target,
    });
  }
  throw new Error(
    `mail-actions needs do=take|copy|delete|send|return, not "${step}".`,
  );
}

export const flow: ProbeFlow = {
  name: "mail-actions",
  run,
  usage:
    "--flow mail-actions [--arg entry=<n>] [--arg id=<n>] [--arg do=take|copy|delete|send|return] [--arg to=<name>] [--arg money=<copper>] [--arg item0=<guid>:<entry>] [--arg subject=<s>] [--arg body=<s>]: walk to the nearest mailbox, list the inbox and run one mail action. Stage at map 0 (-9452, 48, 56.4), within 10 yd of the Goldshire mailbox (entry 142075).",
};
