import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Position = { bag: number; slot: number };
type Args = Readonly<Record<string, string>>;

const BACKPACK = 255;
const DOS = ["open", "read", "text"] as const;
type Do = (typeof DOS)[number];

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function whole(args: Args, key: string, fallback?: number): number {
  const raw = args[key];
  const value = raw === undefined ? fallback : Number(raw);
  if (value === undefined || !Number.isInteger(value) || value < 0)
    throw new Error(`items-open needs ${key}=<number>, not "${raw}".`);
  return value;
}

function doOf(args: Args): Do {
  const value = args["do"];
  const found = DOS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(`items-open needs do=${DOS.join("|")}, not "${value}".`);
  return found;
}

function from(args: Args): Position {
  return { bag: whole(args, "bag", BACKPACK), slot: whole(args, "slot") };
}

function guidAt(handle: WorldHandle, source: Position): bigint {
  const held = handle
    .getInventoryState()
    .slots.find((slot) => slot.bag === source.bag && slot.slot === source.slot);
  if (held?.status !== "occupied")
    throw new Error(`bag ${source.bag} slot ${source.slot} holds no item.`);
  return held.guid;
}

async function act(handle: WorldHandle, kind: Do, at: Position) {
  if (kind === "open") return { outcome: await handle.items.act.open(at) };
  if (kind === "read") return { outcome: await handle.items.act.read(at) };
  const guid = guidAt(handle, at);
  return { guid, outcome: await handle.items.act.queryText(guid) };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const kind = doOf(args);
  const at = from(args);
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  return json({ do: kind, ...(await act(handle, kind, at)) });
}

export const flow: ProbeFlow = {
  name: "items-open",
  run,
  usage:
    "--flow items-open --arg do=open|read|text [--arg bag=<bag>] --arg slot=<slot>: open the container at bag:slot into the loot window, read its page (CMSG_READ_ITEM), or query its item text; prints the loot window, the settled read or the text.",
};
