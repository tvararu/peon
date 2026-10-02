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
    throw new Error(`auction-browse needs ${key}=<number>, not "${raw}".`);
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

function briefRow(row: unknown): Json {
  return json(row);
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
  const name = args["name"];
  const searched = await attempt(() =>
    handle.auction.act.searchAuctions({
      ...(name === undefined ? {} : { name }),
      from: whole(args, "from") ?? 0,
      itemClassFilter: whole(args, "class") ?? 0xff_ff_ff_ff,
    }),
  );
  const owned = await attempt(() => handle.auction.act.listOwnAuctions());
  const bids = await attempt(() => handle.auction.act.listBids([]));
  const state = handle.auction.state();
  return json({
    auctioneer: summary(auctioneer),
    bids,
    brief: {
      bids: state.bids?.rows.length,
      owned: state.owned?.rows.length,
      search: state.search?.rows.length,
      searchDelayMs: state.searchDelayMs,
      total: state.search?.total,
    },
    firstSearchRow: briefRow(state.search?.rows[0]),
    opened,
    owned,
    searched,
  });
}

export const flow: ProbeFlow = {
  name: "auction-browse",
  run,
  usage:
    "--flow auction-browse [--arg npc=<entry>] [--arg name=<text>] [--arg from=<n>] [--arg class=<n>]: walk to the nearest auctioneer (with that creature entry), open the house, search by name, list owned auctions and bids with no outbid ids. Stage at map 530 (9682.5, -7520.5, 18.3), within range of a Silvermoon auctioneer.",
};
