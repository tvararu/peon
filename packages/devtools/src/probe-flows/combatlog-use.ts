import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const WAIT_MS = 10_000;
const USABLE_REGIONS = new Set(["backpack", "bag_item"]);
const USAGE = "combatlog-use needs exactly one of item=<id> or spell=<id>";

type Args = Readonly<Record<string, string>>;

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!(Number.isInteger(value) && value > 0))
    throw new Error(`${USAGE}, not ${key}="${raw}".`);
  return value;
}

function wayOf(self: bigint | undefined, source: bigint, target: bigint) {
  if (source === self) return "out";
  return target === self ? "in" : "other";
}

function selfOf(handle: WorldHandle): bigint | undefined {
  return handle.queryNearby().find((row) => row.self)?.entity.guid;
}

function watchLog(handle: WorldHandle, self: bigint | undefined) {
  const counts: Record<string, number> = {};
  const off = handle.combatlog.onEvent((event) => {
    if (event.type !== "entry") return;
    const key = `${event.kind} ${wayOf(self, event.source, event.target)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return { counts, off };
}

function slotOf(handle: WorldHandle, item: number) {
  return handle
    .getInventoryState()
    .slots.find(
      (slot) =>
        slot.status === "occupied" &&
        USABLE_REGIONS.has(slot.region) &&
        slot.item.entry === item,
    );
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const item = whole(args, "item");
  const spell = whole(args, "spell");
  if ((item === undefined) === (spell === undefined))
    throw new Error(`${USAGE}.`);
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const self = selfOf(handle);
  const watch = watchLog(handle, self);
  try {
    if (item !== undefined) {
      const held = slotOf(handle, item);
      if (!held) throw new Error(`no item ${item} in the bags.`);
      await handle.useItem(held.bag, held.slot);
    } else if (spell !== undefined) {
      handle.cast(spell, self ?? 0n);
    }
    await Bun.sleep(WAIT_MS);
    return { entries: watch.counts, item: item ?? null, spell: spell ?? null };
  } finally {
    watch.off();
  }
}

export const flow: ProbeFlow = {
  name: "combatlog-use",
  run,
  usage:
    "--flow combatlog-use --arg item=<id> | --arg spell=<id>: use the item from the backpack or a bag, or cast the spell on the character, then wait 10 s and print the combat log entries counted by kind and direction.",
};
