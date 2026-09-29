import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function guidOf(raw: string | undefined, key: string): bigint | undefined {
  if (raw === undefined) return undefined;
  const value = raw.startsWith("0x") ? BigInt(raw) : BigInt(`0x${raw}`);
  if (value === 0n)
    throw new Error(`trade-window needs ${key}=<guid>, not "${raw}".`);
  return value;
}

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`trade-window needs ${key}=<number>, not "${raw}".`);
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
type TradeAnswer = "yes" | "busy" | "ignore";

function parseAnswer(raw: string | undefined): TradeAnswer | undefined {
  if (raw === undefined) return undefined;
  if (raw === "yes" || raw === "busy" || raw === "ignore") return raw;
  throw new Error(`trade-window needs answer=yes|busy|ignore, not "${raw}".`);
}

function parseTarget(raw: string | undefined): bigint | undefined {
  return guidOf(raw, "target");
}

async function walkAway(
  handle: WorldHandle,
  away: number | undefined,
): Promise<void> {
  if (away === undefined || away <= 0) return;
  const me = others(handle).find((row) => row.distance !== null);
  if (!me?.position) return;
  const { x, y, z } = me.position;
  await handle.walkTowardPoint({ x, y, z }, 0);
  await handle.walkTowardPoint({ x: x + away, y, z }, away);
}

function requestedFrom(handle: WorldHandle): Json | undefined {
  const state = handle.trade.state();
  if (state.phase !== "requested_in") return undefined;
  return state.from === undefined
    ? "requested"
    : `0x${state.from.toString(16)}`;
}

async function runTarget(
  ctx: FlowContext,
  target: bigint,
  away: number | undefined,
): Promise<Json> {
  const { handle } = ctx;
  await walkAway(handle, away);
  const outcome = await attempt(() => handle.trade.act.requestTrade(target));
  return json({ outcome, state: handle.trade.state() });
}

async function runAnswer(ctx: FlowContext, answer: TradeAnswer): Promise<Json> {
  const { handle, settle } = ctx;
  const requested = await waitFor(settle, () => requestedFrom(handle), 60_000);
  if (requested === undefined)
    return json({ outcome: "no_request", state: handle.trade.state() });
  const from = handle.trade.state().from;
  const outcome = await attempt(() => handle.trade.act.answerTrade(answer));
  const opened =
    answer === "yes"
      ? await waitFor(
          settle,
          () => (handle.trade.state().phase === "open" ? "open" : undefined),
          10_000,
        )
      : undefined;
  const canceled =
    answer === "yes" && opened === "open"
      ? await attempt(() => handle.trade.act.cancelTrade())
      : undefined;
  return json({ canceled, from, opened, outcome, state: handle.trade.state() });
}

function run(ctx: FlowContext): Promise<Json> {
  const { args } = ctx;
  const answer = parseAnswer(args["answer"]);
  const target = parseTarget(args["target"]);
  const away = whole(args, "away");
  if (target !== undefined) return runTarget(ctx, target, away);
  if (answer === undefined) {
    const missing = "answer or target";
    throw new Error(`trade-window needs ${missing}.`);
  }
  return runAnswer(ctx, answer);
}

export const flow: ProbeFlow = {
  name: "trade-window",
  run,
  usage:
    "--flow trade-window (--arg answer=yes|busy|ignore [--arg away=<yards>] | --arg target=<guid> [--arg away=<yards>]): wait up to 60 s for a trade request, answer it (yes opens the window, then cancels), or send CMSG_INITIATE_TRADE to target after walking away yards first.",
};

export function tradeWindowNearby(handle: WorldHandle): Json {
  return json(others(handle).map((row) => summary(row)));
}
