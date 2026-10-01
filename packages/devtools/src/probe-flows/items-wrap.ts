import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;
type Position = { bag: number; slot: number };
type Slots = ReturnType<WorldHandle["getInventoryState"]>["slots"];
type Held = Extract<Slots[number], { status: "occupied" }>;

const DOS = ["wrap", "name"] as const;
type Do = (typeof DOS)[number];

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function doOf(args: Args): Do {
  const value = args["do"];
  const found = DOS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(`items-wrap needs do=${DOS.join("|")}, not "${value}".`);
  return found;
}

function whole(raw: string | undefined, key: string): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isInteger(value) || value < 0)
    throw new Error(`items-wrap needs ${key}=<number>, not "${raw}".`);
  return value;
}

function held(slots: Slots): Held[] {
  return slots.filter((s): s is Held => s.status === "occupied");
}

type Ref = { entry: number } | { bag: number; slot: number };

function refOf(raw: string | undefined, key: string): Ref {
  if (raw === undefined)
    throw new Error(`items-wrap needs ${key}=<entry>|<bag>:<slot>.`);
  const [first, second] = raw.split(":");
  if (second === undefined) return { entry: whole(first, key) };
  return { bag: whole(first, key), slot: whole(second, key) };
}

function find(slots: Slots, ref: Ref, label: string): Held {
  const found = held(slots).find((s) =>
    "entry" in ref
      ? s.item.entry === ref.entry
      : s.bag === ref.bag && s.slot === ref.slot,
  );
  if (!found) throw new Error(`items-wrap carries nothing at ${label}.`);
  return found;
}

const at = ({ bag, slot }: Held): Position => ({ bag, slot });

async function wrap(
  ctx: FlowContext,
  giftRef: Ref,
  itemRef: Ref,
): Promise<Json> {
  const { handle, args, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const before = handle.getInventoryState().slots;
  const gift = find(before, giftRef, `gift=${args["gift"]}`);
  const item = find(before, itemRef, `item=${args["item"]}`);
  const outcome = await handle.items.act.wrap(at(gift), at(item));
  const after = held(handle.getInventoryState().slots);
  const wrapped = after.find((s) => s.guid === item.guid);
  const paper = after.find((s) => s.guid === gift.guid);
  return json({
    after: wrapped && {
      entry: wrapped.item.entry,
      guid: wrapped.guid,
      wrapped: wrapped.item.flagBits?.wrapped,
    },
    gift: at(gift),
    item: at(item),
    outcome,
    paper: paper && { count: paper.item.count, entry: paper.item.entry },
  });
}

async function name(ctx: FlowContext): Promise<Json> {
  const entry = whole(ctx.args["entry"], "entry");
  const row = await ctx.handle.items.act.querySetItemName(entry);
  return json({ name: row ?? null });
}

function run(ctx: FlowContext): Promise<Json> {
  if (doOf(ctx.args) === "name") {
    whole(ctx.args["entry"], "entry");
    return name(ctx);
  }
  return wrap(
    ctx,
    refOf(ctx.args["gift"], "gift"),
    refOf(ctx.args["item"], "item"),
  );
}

export const flow: ProbeFlow = {
  name: "items-wrap",
  run,
  usage:
    "--flow items-wrap --arg do=wrap --arg gift=<entry|bag:slot> --arg item=<entry|bag:slot>: send CMSG_WRAP_ITEM for a carried gift paper and item and report the move outcome, the item's entry and wrapped flag afterwards and the paper left; --arg do=name --arg entry=<item entry>: send CMSG_ITEM_NAME_QUERY and report the set-item name row, or null after 5 s of silence.",
};
