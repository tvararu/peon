import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  type Settle,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 6;

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
    throw new Error(`auction-trade needs ${key}=<number>, not "${raw}".`);
  return value;
}

function guidArg(args: Args, key: string): bigint | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  try {
    return BigInt(raw);
  } catch (error) {
    throw new Error(`auction-trade needs ${key}=<guid>, not "${raw}".`, {
      cause: error,
    });
  }
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

async function carriedGuid(
  settle: Settle,
  handle: WorldHandle,
  entry: number,
): Promise<bigint | undefined> {
  const stack = await settle(() =>
    handle
      .getInventoryState()
      .slots.find(
        (slot) => slot.status === "occupied" && slot.item.entry === entry,
      ),
  );
  if (stack?.status !== "occupied") return undefined;
  return stack.guid;
}

async function post(ctx: FlowContext, args: Args): Promise<Json> {
  const { handle, settle } = ctx;
  const entry = whole(args, "item");
  if (entry === undefined)
    throw new Error("auction-trade needs item=<entry> to post.");
  const guid = await carriedGuid(settle, handle, entry);
  if (guid === undefined)
    return { skipped: `no item ${entry} is carried to post.` };
  const count = whole(args, "count") ?? 1;
  return await attempt(() =>
    handle.auction.act.postAuction({
      bid: whole(args, "bid") ?? 9000,
      buyout: whole(args, "buyout") ?? 10_000,
      count,
      hours: whole(args, "hours") ?? 12,
      item: guid,
    }),
  );
}
async function cancel(ctx: FlowContext, args: Args): Promise<Json> {
  const { handle, settle } = ctx;
  const wanted = whole(args, "id");
  if (wanted === undefined)
    throw new Error("auction-trade needs id=<auction id> to cancel.");
  const listed = await settle(() => handle.auction.act.listOwnAuctions());
  if (listed?.status !== "ok") return json(listed);
  const own = handle.auction
    .state()
    .owned?.rows.find((row) => row.id === wanted);
  if (!own) return { skipped: `auction ${wanted} is not on the own list.` };
  return await attempt(() => handle.auction.act.cancelAuction(wanted));
}

async function bidOrBuyout(ctx: FlowContext, args: Args): Promise<Json> {
  const { handle, settle } = ctx;
  const wanted = whole(args, "id");
  const owner = guidArg(args, "owner");
  if (wanted === undefined || owner === undefined)
    throw new Error("auction-trade needs id=<auction id> owner=<guid>.");
  const searched = await settle(() =>
    handle.auction.act.searchAuctions({
      itemClassFilter: 0xff_ff_ff_ff,
    }),
  );
  if (searched?.status !== "ok") return json(searched);
  const row = handle.auction.state().search?.rows.find((r) => r.id === wanted);
  if (!row) return { skipped: `auction ${wanted} is not in the search page.` };
  if (row.owner !== owner)
    return { skipped: `auction ${wanted} is not owned by the given owner.` };
  const asked = whole(args, "price");
  let price = row.startBid;
  if (asked !== undefined) price = asked;
  else if (ctx.args["do"] === "buyout" && row.buyout !== 0) price = row.buyout;
  return await attempt(() => handle.auction.act.bid(wanted, price));
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  const npc = whole(args, "npc");
  const auctioneer = await settle(() =>
    others(handle).find(
      (r) =>
        r.roles.includes("auctioneer") &&
        (npc === undefined || r.entity.entry === npc),
    ),
  );
  if (!auctioneer) throw new Error("no auctioneer is in view.");
  await reach(handle, auctioneer.entity.guid);
  const opened = await attempt(() =>
    handle.auction.act.openAuctionHouse(auctioneer.entity.guid),
  );
  if (
    typeof opened !== "object" ||
    opened === null ||
    !("status" in opened) ||
    opened["status"] !== "ok"
  )
    return json({ auctioneer: summary(auctioneer), opened });
  const doing = args["do"] ?? "pending";
  if (doing === "post") return json(await post(ctx, args));
  if (doing === "cancel") return json(await cancel(ctx, args));
  if (doing === "bid" || doing === "buyout")
    return json(await bidOrBuyout(ctx, args));
  if (doing === "bid-own") {
    const wanted = whole(args, "id");
    if (wanted === undefined)
      throw new Error("auction-trade needs id=<auction id> to bid-own.");
    return await attempt(() =>
      handle.auction.act.bid(wanted, whole(args, "price") ?? 1),
    );
  }
  if (doing === "pending")
    return await attempt(() => handle.auction.act.listPendingSales());
  throw new Error(
    `auction-trade needs do=post|cancel|bid|buyout|bid-own|pending, not "${doing}".`,
  );
}

export const flow: ProbeFlow = {
  name: "auction-trade",
  run,
  usage:
    "--flow auction-trade --arg do=<verb> [--arg npc=<entry>] [--arg item=<entry>] [--arg id=<auction id>] [--arg owner=<guid>]: walk to the nearest auctioneer, open the house and run one auction command. Verbs: post, cancel, bid, buyout, bid-own, pending. bid and buyout refuse unless the held search row with that id has that owner. Stage at map 530 (9682.5, -7520.5, 18.3), within range of a Silvermoon auctioneer.",
};
