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

type Letter = ReturnType<WorldHandle["mail"]["state"]>["inbox"][number];

type StepCtx = {
  handle: WorldHandle;
  args: Args;
  boxGuid: bigint;
  box: Json;
  listed: Json;
  letter: Letter | undefined;
  target: { id: number; subject: string } | null;
};

function findLetter(handle: WorldHandle, id: number | undefined, step: string) {
  const inbox = handle.mail.state().inbox;
  if (id !== undefined) return inbox.find((mail) => mail.id === id);
  if (step === "copy" || step === "delete" || step === "return")
    return inbox.find((mail) => mail.subject === "Some text") ?? inbox[0];
  return inbox.find((mail) => mail.money > 0 || mail.items.length > 0);
}

function findMailbox(
  handle: WorldHandle,
  entry: number | undefined,
): () => ReturnType<WorldHandle["queryNearby"]>[number] | undefined {
  return () =>
    others(handle).find((r) => {
      if (entityType(r) !== "gameobject") return false;
      if (entry !== undefined && r.entity.entry !== entry) return false;
      if (r.roles.includes("mailbox")) return true;
      return (
        handle.objects.state().templates.get(r.entity.entry)?.type ===
        MAILBOX_OBJECT_TYPE
      );
    });
}

async function takeStep(ctx: StepCtx): Promise<Json> {
  const { handle, boxGuid, box, listed, letter, target } = ctx;
  const money =
    letter !== undefined && letter.money > 0
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
  const relisted = await attempt(() => handle.mail.act.listMail(boxGuid));
  return json({
    box,
    item,
    listed,
    money,
    relisted,
    state: brief(handle),
    target,
  });
}

function actOnce(
  handle: WorldHandle,
  kind: "copy" | "delete" | "return",
  id: number,
): Promise<unknown> {
  if (kind === "copy") return handle.mail.act.copyMailText(id);
  if (kind === "delete") return handle.mail.act.deleteMail(id);
  return handle.mail.act.returnMail(id);
}

function stepKey(kind: "copy" | "delete" | "return"): string {
  if (kind === "copy") return "copy";
  if (kind === "delete") return "removed";
  return "returned";
}

async function singleStep(
  ctx: StepCtx,
  kind: "copy" | "delete" | "return",
): Promise<Json> {
  const { handle, boxGuid, box, listed, letter, target } = ctx;
  const outcome =
    letter === undefined
      ? { skipped: `no letter to ${kind}` }
      : await attempt(() => actOnce(handle, kind, letter.id));
  const relisted =
    kind === "copy"
      ? undefined
      : await attempt(() => handle.mail.act.listMail(boxGuid));
  return json({
    box,
    listed,
    state: brief(handle),
    target,
    ...(relisted === undefined ? {} : { relisted }),
    [stepKey(kind)]: outcome,
  });
}

function sendItems(handle: WorldHandle, args: Args) {
  const inv = handle.getInventoryState();
  const itemArgs = [args["item0"], args["item1"]]
    .map((raw) => raw?.split(":"))
    .filter(
      (part): part is [string, string] =>
        part !== undefined && part.length === 2,
    );
  const seen = new Set<string>();
  return itemArgs.map(([guid, slot]) => {
    const key = `${guid}:${slot}`;
    if (seen.has(key)) throw new Error(`duplicate item ${guid} entry ${slot}.`);
    seen.add(key);
    const entry = Number(slot);
    const row = inv.slots.find(
      (candidate) =>
        candidate.status === "occupied" &&
        candidate.guid === BigInt(guid) &&
        candidate.item.entry === entry,
    );
    if (row?.status !== "occupied")
      throw new Error(`no carried item ${guid} entry ${slot}.`);
    return { guid: row.guid, slot: row.slot };
  });
}

async function sendStep(ctx: StepCtx, unread: boolean): Promise<Json> {
  const { handle, args, box, listed } = ctx;
  const to = args["to"];
  if (!to) throw new Error("mail-actions needs to=<name> for do=send.");
  let found: { guid: bigint; slot: number }[];
  try {
    found = sendItems(handle, args);
  } catch (error) {
    return json({
      box,
      listed,
      sent: { thrown: error instanceof Error ? error.message : String(error) },
      state: brief(handle),
      unread,
    });
  }
  const sent = await attempt(() =>
    handle.mail.act.sendMail({
      body: args["body"] ?? "",
      receiver: to,
      subject: args["subject"] ?? "Hello",
      ...(args["money"] === undefined ? {} : { money: Number(args["money"]) }),
      ...(found.length === 0 ? {} : { items: found }),
    }),
  );
  return json({
    box,
    listed,
    sent,
    state: brief(handle),
    unread,
  });
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  const entry = whole(args, "entry");
  const id = whole(args, "id");
  const box = await settle(findMailbox(handle, entry));
  if (!box) throw new Error("no mailbox is in view.");
  await reach(handle, box.entity.guid);
  const listed = await attempt(() => handle.mail.act.listMail(box.entity.guid));
  const state = handle.mail.state();
  const step = args["do"] ?? "take";
  const letter = findLetter(handle, id, step);
  const target =
    letter === undefined ? null : { id: letter.id, subject: letter.subject };
  const stepCtx: StepCtx = {
    args,
    box: summary(box),
    boxGuid: box.entity.guid,
    handle,
    letter,
    listed,
    target,
  };
  if (step === "take") return takeStep(stepCtx);
  if (step === "copy" || step === "delete" || step === "return")
    return singleStep(stepCtx, step);
  if (step === "send") return sendStep(stepCtx, state.unread);
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
