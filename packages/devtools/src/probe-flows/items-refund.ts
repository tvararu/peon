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
const BACKPACK = 255;
const PACK_FIRST = 23;
const PACK_ACCEPTED_LAST = 36;

type Args = Readonly<Record<string, string>>;

const DOS = ["buy", "info", "refund"] as const;
type Do = (typeof DOS)[number];

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
    throw new Error(`items-refund needs ${key}=<number>, not "${raw}".`);
  return value;
}

function doOf(args: Args): Do {
  const value = args["do"];
  const found = DOS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(`items-refund needs do=${DOS.join("|")}, not "${value}".`);
  return found;
}

function guidOf(raw: string | undefined): bigint {
  if (raw === undefined) throw new Error("items-refund needs item=<guid>.");
  try {
    return BigInt(raw);
  } catch (cause) {
    throw new Error(`items-refund needs item=<guid>, not "${raw}".`, { cause });
  }
}

async function reach(handle: WorldHandle, guid: bigint): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const row = others(handle).find((r) => r.entity.guid === guid);
    if (!row?.position || row.distance === null || row.distance <= REACH_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - REACH_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

function emptyPackSlot(handle: WorldHandle): number | undefined {
  return handle
    .getInventoryState()
    .slots.find(
      (slot) =>
        slot.bag === BACKPACK &&
        slot.slot >= PACK_FIRST &&
        slot.slot <= PACK_ACCEPTED_LAST &&
        slot.status === "empty",
    )?.slot;
}

async function buy(ctx: FlowContext, npc: number): Promise<Json> {
  const { handle, args, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const vendor = await settle(() =>
    others(handle).find(
      (r) => r.roles.includes("vendor") && r.entity.entry === npc,
    ),
  );
  if (!vendor) throw new Error("no vendor is in view.");
  await reach(handle, vendor.entity.guid);
  handle.openVendor(vendor.entity.guid);
  const window = await settle(() => handle.getVendorState().window);
  if (!window) throw new Error("the vendor sent no list.");
  const slot = whole(args, "slot") ?? window.items[0]?.slot;
  if (slot === undefined) throw new Error("the vendor list is empty.");
  const row = window.items.find((item) => item.slot === slot);
  const pack = emptyPackSlot(handle);
  if (pack === undefined) throw new Error("the backpack is full.");
  const bought = await handle.buyback.act.buyInSlot({
    bag: BACKPACK,
    count: 1,
    slot: pack,
    vendorSlot: slot,
  });
  const carried = await settle(() => {
    const found = handle
      .getInventoryState()
      .slots.find((s) => s.bag === BACKPACK && s.slot === pack);
    return found?.status === "occupied" ? found.guid : undefined;
  });
  return json({
    bought,
    carried,
    entry: row?.itemId,
    paid: window.items
      .filter((item) => item.extendedCost !== 0)
      .map((item) => ({
        extendedCost: item.extendedCost,
        itemId: item.itemId,
        slot: item.slot,
      })),
    slot,
    vendor: summary(vendor),
  });
}

async function query(ctx: FlowContext, kind: Do): Promise<Json> {
  const { handle, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const guid = guidOf(ctx.args["item"]);
  if (kind === "info")
    return json({ offer: await handle.items.act.refundInfo(guid) });
  return json({ outcome: await handle.items.act.refund(guid) });
}

function run(ctx: FlowContext): Promise<Json> {
  const kind = doOf(ctx.args);
  if (kind === "buy") {
    const npc = whole(ctx.args, "npc");
    if (npc === undefined) throw new Error("items-refund needs npc=<entry>.");
    return buy(ctx, npc);
  }
  return query(ctx, kind);
}

export const flow: ProbeFlow = {
  name: "items-refund",
  run,
  usage:
    "--flow items-refund --arg do=buy --arg npc=<entry> [--arg slot=<vendor slot>]: walk to the vendor and buy its row into the first empty backpack slot, returning the bought row's entry and carried guid plus every priced row (extendedCost nonzero); --arg do=info|refund --arg item=<guid>: read the refund offer for the carried item (CMSG_ITEM_REFUND_INFO) or send the refund (CMSG_ITEM_REFUND).",
};
