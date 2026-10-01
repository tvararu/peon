import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const USAGE =
  "selfstate-drink needs item=<id> and count=<n> (e.g. item=2594 count=5), or rest=yes.";
const USE_GAP_MS = 1500;
const CAP_MS = 20_000;
const ZONE_TICK_MS = 6000;
const SAMPLE_MS = 1000;
const USABLE_REGIONS = new Set(["backpack", "bag_item"]);

function whole(
  args: Readonly<Record<string, string>>,
  key: string,
): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!(Number.isInteger(value) && value > 0))
    throw new Error(`${USAGE} Not ${key}="${raw}".`);
  return value;
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

function conditionOf(handle: WorldHandle): Json {
  return { ...handle.selfstate.state().condition };
}

async function drink(
  { handle }: FlowContext,
  item: number,
  count: number,
): Promise<Json> {
  const changes: Json[] = [];
  const off = handle.selfstate.onEvent((event) => {
    if (event.type === "drunk_changed")
      changes.push({ from: event.from, item: event.item, to: event.to });
  });
  const stop = Date.now() + CAP_MS;
  let used = 0;
  try {
    while (used < count && Date.now() < stop) {
      if (handle.selfstate.state().condition.drunkState === "smashed") break;
      const held = slotOf(handle, item);
      if (!held) break;
      await handle.useItem(held.bag, held.slot);
      used += 1;
      await Bun.sleep(USE_GAP_MS);
    }
    return { changes, condition: conditionOf(handle), used };
  } finally {
    off();
  }
}

async function rest(
  handle: WorldHandle,
  seconds: number | undefined,
): Promise<Json> {
  const samples: Json[] = [];
  const ticks = seconds ?? ZONE_TICK_MS / SAMPLE_MS;
  for (let tick = 0; tick < ticks; tick += 1) {
    await Bun.sleep(SAMPLE_MS);
    samples.push({ at: tick + 1, condition: conditionOf(handle) });
  }
  return { condition: conditionOf(handle), samples };
}

async function run(ctx: FlowContext): Promise<Json> {
  const { args, handle, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  if (args["rest"] === "yes") return rest(handle, whole(args, "seconds"));
  const item = whole(args, "item");
  const count = whole(args, "count");
  if (item === undefined || count === undefined) throw new Error(USAGE);
  return drink(ctx, item, count);
}

export const flow: ProbeFlow = {
  name: "selfstate-drink",
  run,
  usage:
    "--flow selfstate-drink --arg item=<id> --arg count=<n> | --arg rest=yes [--arg seconds=<n>]: drink up to <n> of the item from the backpack or a bag (one every 1.5 s, 20 s cap, stops at smashed) and print the drunk_changed events and the final condition; rest=yes [--arg seconds=<n>] samples the condition once a second for n seconds (default 6, the zone tick) and prints the samples and the final condition (resting, rest state, rested XP).",
};
