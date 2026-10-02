import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const FISHING_SPELL = 7620;
const HEX = /^0x[0-9a-fA-F]+$/;
const DEFAULT_CAST_SECONDS = 25;

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function parseSeconds(text: string | undefined): number {
  if (text === undefined) return DEFAULT_CAST_SECONDS;
  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120)
    throw new Error(`objects-fish needs seconds=<1-120>, not "${text}".`);
  return seconds;
}

function parseBobber(text: string | undefined): bigint | undefined {
  if (text === undefined) return undefined;
  if (!HEX.test(text))
    throw new Error(`objects-fish needs bobber=<0x...>, not "${text}".`);
  return BigInt(text);
}

function parseFacing(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const radians = Number(text);
  if (!Number.isFinite(radians))
    throw new Error(`objects-fish needs facing=<radians>, not "${text}".`);
  return radians;
}

type UseMode =
  | { kind: "none" }
  | { kind: "hooked" }
  | { kind: "after"; seconds: number };

function parseUse(text: string | undefined): UseMode {
  if (text === undefined) return { kind: "none" };
  if (text === "hooked") return { kind: "hooked" };
  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
    throw new Error(`objects-fish needs use=<0-120|hooked>, not "${text}".`);
  return { kind: "after", seconds };
}

const POLL_MS = 100;
const AFTER_USE_MS = 2000;

type Watch = {
  seen: Json[];
  ended: boolean;
  usedAt: number | undefined;
  useBobber: (guid: bigint) => void;
  stop: () => void;
};

function watch(handle: WorldHandle, use: UseMode): Watch {
  const w: Watch = {
    ended: false,
    seen: [],
    stop: () => undefined,
    useBobber: (guid) => {
      if (w.usedAt !== undefined) return;
      w.usedAt = Date.now();
      handle.objects.act.use(guid);
    },
    usedAt: undefined,
  };
  const offFish = handle.objects.onEvent((event) => {
    if (event.type === "fish_hooked") {
      w.seen.push({ bobber: hex(event.bobber), event: "fish_hooked" });
      if (use.kind === "hooked") w.useBobber(event.bobber);
    } else if (
      event.type === "fish_not_hooked" ||
      event.type === "fish_escaped"
    ) {
      w.seen.push({ event: event.type });
      w.ended = true;
    }
  });
  w.stop = offFish;
  return w;
}

function bobberJson(handle: WorldHandle, guid: bigint): Json {
  const row = handle.queryNearby().find((near) => near.entity.guid === guid);
  return row ? summary(row) : hex(guid);
}

function fishingJson(handle: WorldHandle): Json {
  const fishing = handle.objects.state().fishing;
  if (!fishing) return null;
  return {
    bobber: fishing.bobber === undefined ? null : hex(fishing.bobber),
    phase: fishing.phase,
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = parseSeconds(args["seconds"]);
  const bobberArg = parseBobber(args["bobber"]);
  const facing = parseFacing(args["facing"]);
  const use = parseUse(args["use"]);
  if (facing !== undefined) handle.face(facing);
  await settle(() => (handle.queryNearby().length === 0 ? undefined : true));
  const w = watch(handle, use);
  const deadline = Date.now() + seconds * 1000;
  try {
    handle.cast(FISHING_SPELL, 0n);
    if (use.kind === "after") {
      await Bun.sleep(use.seconds * 1000);
      const own = handle.objects.state().fishing?.bobber;
      if (own !== undefined) w.useBobber(own);
    }
    const state = await settle(() =>
      handle.objects.state().fishing?.bobber === undefined
        ? undefined
        : handle.objects.state().fishing,
    );
    const bobber =
      state?.bobber === undefined
        ? null
        : bobberJson(handle, bobberArg ?? state.bobber);
    while (
      state?.bobber !== undefined &&
      !w.ended &&
      Date.now() < deadline &&
      (w.usedAt === undefined || Date.now() - w.usedAt < AFTER_USE_MS)
    )
      await Bun.sleep(POLL_MS);
    return { bobber, fishing: fishingJson(handle), seen: w.seen };
  } finally {
    w.stop();
  }
}

export const flow: ProbeFlow = {
  name: "objects-fish",
  run,
  usage:
    "--flow objects-fish [--arg seconds=<s>] [--arg bobber=<0x...>] [--arg facing=<radians>] [--arg use=<seconds-after-cast|hooked>]: cast Fishing (7620) with no target, optionally face first and use the own bobber once, after <use> seconds or at once on the bite (use=hooked), then wait until a fish event, 2 s after the use or <seconds>, and report the fishing state and the fish events.",
};
