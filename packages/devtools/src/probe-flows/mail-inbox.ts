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
    throw new Error(`mail-inbox needs ${key}=<number>, not "${raw}".`);
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

function firstUnread(
  handle: WorldHandle,
): { id: number; subject: string } | undefined {
  const found = handle.mail.state().inbox.find((mail) => !mail.flags.read);
  return found ? { id: found.id, subject: found.subject } : undefined;
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
    mailbox: state.mailbox,
    newMail: state.newMail,
    senders: state.senders,
    unread: state.unread,
  });
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  const entry = whole(args, "entry");
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
  const nextBefore = await attempt(() => handle.mail.act.queryNextMail());
  const listed = await attempt(() => handle.mail.act.listMail(box.entity.guid));
  const first = firstUnread(handle);
  const marked =
    first === undefined
      ? { skipped: "the inbox has no unread letter" }
      : await attempt(() => handle.mail.act.markMailRead(first.id));
  const relisted = await attempt(() =>
    handle.mail.act.listMail(box.entity.guid),
  );
  const nextAfter = await attempt(() => handle.mail.act.queryNextMail());
  return json({
    box: summary(box),
    first: first ?? null,
    listed,
    marked,
    nextAfter,
    nextBefore,
    relisted,
    state: brief(handle),
  });
}

export const flow: ProbeFlow = {
  name: "mail-inbox",
  run,
  usage:
    "--flow mail-inbox [--arg entry=<n>]: walk to the nearest mailbox (with that gameobject entry), query next mail time, list the inbox, mark the first unread letter read, list again, query again.",
};
