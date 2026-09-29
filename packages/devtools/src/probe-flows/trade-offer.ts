import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

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
    throw new Error(`trade-offer needs ${key}=<number>, not "${raw}".`);
  return value;
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

async function waitFor(
  settle: FlowContext["settle"],
  read: () => Json | undefined,
  ms: number,
): Promise<Json | undefined> {
  const deadline = Date.now() + ms;
  let value = read();
  while (value === undefined && Date.now() < deadline) {
    await Bun.sleep(100);
    value = read();
  }
  return value ?? (await settle(read));
}

type Offer = { entry: number; count: number };

function offerOf(args: Args): Offer | undefined {
  const raw = args["offer"];
  if (raw === undefined) return undefined;
  const parts = raw.split(":").map(Number);
  const entry = parts[0] ?? Number.NaN;
  const count = parts[1] ?? 1;
  if (!Number.isInteger(entry) || entry <= 0)
    throw new Error(`trade-offer needs offer=<entry>:<count>, not "${raw}".`);
  return { count: Number.isInteger(count) && count > 0 ? count : 1, entry };
}

type Located = { bag: number; entry: number; slot: number };

function bagSlot(handle: WorldHandle, entry: number): Located | undefined {
  const found = handle
    .getInventoryState()
    .slots.find(
      (slot) => slot.status === "occupied" && slot.item.entry === entry,
    );
  if (found?.status !== "occupied") return undefined;
  return { bag: found.bag, entry, slot: found.slot };
}
function theirVersion(handle: WorldHandle): number {
  return handle.trade.state().theirOffer.version;
}

function backToTrade(handle: WorldHandle): Json | undefined {
  const accepted = handle.trade.state().selfAccepted;
  return accepted === false && handle.trade.state().theirOffer.version > 0
    ? "seen"
    : undefined;
}

async function run(ctx: FlowContext): Promise<Json> {
  const { args, handle, settle } = ctx;
  const offer = offerOf(args);
  const gold = whole(args, "gold");
  const where = whole(args, "slot") ?? 0;
  const unaccept = args["unaccept"] === "1";
  const located = offer ? bagSlot(handle, offer.entry) : undefined;
  const version0 = theirVersion(handle);
  const offered =
    offer && located !== undefined
      ? await attempt(() =>
          handle.trade.act.offerItem(where, located.bag, located.slot),
        )
      : undefined;
  const gilded =
    gold === undefined
      ? undefined
      : await attempt(() => handle.trade.act.offerGold(gold));
  const seen = theirVersion(handle);
  const accepted = await attempt(() => handle.trade.act.acceptTrade(seen));
  const unaccepted = unaccept
    ? await attempt(() => handle.trade.act.unacceptTrade())
    : undefined;
  const reset = unaccept
    ? await waitFor(settle, () => backToTrade(handle), 10_000)
    : undefined;
  return json({
    accepted,
    gilded,
    located,
    offered,
    reset,
    state: handle.trade.state(),
    unaccepted,
    version0,
  });
}

export const flow: ProbeFlow = {
  name: "trade-offer",
  run,
  usage:
    "--flow trade-offer [--arg offer=<entry>:<count>] [--arg gold=<copper>] [--arg slot=<trade slot>] [--arg unaccept=1]: wait up to 60 s for the trade window, offer the first backpack item with entry plus gold, accept with the seen version; unaccept=1 unaccepts and waits for BACK_TO_TRADE.",
};
