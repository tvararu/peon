import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const WATER = 159;
const BACKPACK = 255;
const PACK_FIRST = 23;
const PACK_LAST = 38;

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
    throw new Error(`buyback-vendor needs ${key}=<number>, not "${raw}".`);
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

async function sell(ctx: FlowContext, entry: number): Promise<Json> {
  const { handle, settle } = ctx;
  const held = handle
    .getInventoryState()
    .slots.find(
      (slot) => slot.status === "occupied" && slot.item.entry === entry,
    );
  if (held?.status !== "occupied")
    throw new Error(`no item ${entry} is carried to sell.`);
  handle.sellItem(held.bag, held.slot);
  const sold = await settle(() =>
    handle.buyback.state().list.find((row) => row.guid === held.guid),
  );
  return json({ from: { bag: held.bag, slot: held.slot }, sold: sold ?? null });
}

function emptyPackSlot(handle: WorldHandle): number | undefined {
  return handle
    .getInventoryState()
    .slots.find(
      (slot) =>
        slot.bag === BACKPACK &&
        slot.slot >= PACK_FIRST &&
        slot.slot <= PACK_LAST &&
        slot.status === "empty",
    )?.slot;
}

function buyInPack(handle: WorldHandle, itemId: number): Json | Promise<Json> {
  const good = handle
    .getVendorState()
    .window?.items.find((item) => item.itemId === itemId);
  const slot = emptyPackSlot(handle);
  if (!good || slot === undefined)
    return {
      skipped: good ? "no empty backpack slot" : `item ${itemId} not sold`,
    };
  return attempt(() =>
    handle.buyback.act.buyInSlot({
      bag: BACKPACK,
      count: 1,
      slot,
      vendorSlot: good.slot,
    }),
  );
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const npc = whole(args, "npc");
  const vendor = await settle(() =>
    others(handle).find(
      (r) =>
        r.roles.includes("vendor") &&
        (npc === undefined || r.entity.entry === npc),
    ),
  );
  if (!vendor) throw new Error("no vendor is in view.");
  await reach(handle, vendor.entity.guid);
  handle.openVendor(vendor.entity.guid);
  const window = await settle(() => handle.getVendorState().window);
  if (!window) throw new Error("the vendor sent no list.");
  const poor = args["poor"] === "1";
  const entry = whole(args, "sell");
  const sale = poor || entry === undefined ? null : await sell(ctx, entry);
  const list = handle.buyback.state().list;
  const slot = whole(args, "slot") ?? list[0]?.slot;
  const buyback =
    slot === undefined
      ? { skipped: "the buyback list is empty" }
      : await attempt(() => handle.buyback.act.buyback(slot));
  const buyInSlot = poor
    ? null
    : await buyInPack(handle, whole(args, "buy") ?? WATER);
  return json({
    buyback,
    buyInSlot,
    list,
    sale,
    state: handle.buyback.state(),
    vendor: summary(vendor),
  });
}

export const flow: ProbeFlow = {
  name: "buyback-vendor",
  run,
  usage:
    "--flow buyback-vendor [--arg npc=<entry>] [--arg sell=<entry>] [--arg slot=<74-85>] [--arg buy=<item>] [--arg poor=1]: walk to the nearest vendor (with that creature entry) and list it, sell one carried item of that entry, buy back the given or first buyback slot, then buy item buy (default 159) into the first empty backpack slot; poor=1 skips the sale and the purchase and only calls buyback, for the money refusal.",
};
