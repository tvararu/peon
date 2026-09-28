import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Position = { bag: number; slot: number };
type Args = Readonly<Record<string, string>>;
type Moved = Awaited<ReturnType<WorldHandle["items"]["act"]["move"]>>;

const BACKPACK = 255;
const DOS = ["equip", "equip_to", "unequip", "move", "split"] as const;
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
    throw new Error(`items-move needs ${key}=<number>, not "${raw}".`);
  return value;
}

function position(args: Args, key: string): Position {
  const raw = args[key] ?? "";
  const [bag, slot] = raw.includes(":")
    ? raw.split(":").map(Number)
    : [BACKPACK, Number(raw)];
  if (!(Number.isInteger(bag) && Number.isInteger(slot)))
    throw new Error(
      `items-move needs ${key}=<bag>:<slot> or <slot>, not "${raw}".`,
    );
  return { bag: bag ?? BACKPACK, slot: slot ?? 0 };
}

function doOf(args: Args): Do {
  const value = args["do"];
  const found = DOS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(`items-move needs do=${DOS.join("|")}, not "${value}".`);
  return found;
}

function guidAt(handle: WorldHandle, source: Position): bigint {
  const held = handle
    .getInventoryState()
    .slots.find((slot) => slot.bag === source.bag && slot.slot === source.slot);
  if (held?.status !== "occupied")
    throw new Error(`bag ${source.bag} slot ${source.slot} holds no item.`);
  return held.guid;
}

const ACTS: Readonly<
  Record<Do, (handle: WorldHandle, args: Args) => Promise<Moved>>
> = {
  equip: (handle, args) => handle.items.act.equip(from(args)),
  equip_to: (handle, args) =>
    handle.items.act.equipTo(guidAt(handle, from(args)), whole(args, "to")),
  move: (handle, args) =>
    handle.items.act.move(from(args), position(args, "to")),
  split: (handle, args) =>
    handle.items.act.split(
      from(args),
      position(args, "to"),
      whole(args, "count"),
    ),
  unequip: (handle, args) =>
    handle.items.act.unequip(whole(args, "slot"), whole(args, "to", 0)),
};

function from(args: Args): Position {
  return { bag: whole(args, "bag", BACKPACK), slot: whole(args, "slot") };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  doOf(args);
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const outcome = await ACTS[doOf(args)](handle, args);
  return json({ do: args["do"], outcome });
}

export const flow: ProbeFlow = {
  name: "items-move",
  run,
  usage:
    "--flow items-move --arg do=equip|equip_to|unequip|move|split [--arg bag=<bag>] --arg slot=<slot> [--arg to=<slot>|<bag>:<slot>] [--arg count=<n>]: equip the item at bag:slot, equip it into equipment slot to (equip_to), unequip equipment slot into bag to (0 any), move or split bag:slot to to; prints the settled move state.",
};
