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

function parseUse(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
    throw new Error(`objects-fish needs use=<0-120>, not "${text}".`);
  return seconds;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = parseSeconds(args["seconds"]);
  const bobberArg = parseBobber(args["bobber"]);
  const facing = parseFacing(args["facing"]);
  const useAfter = parseUse(args["use"]);
  if (facing !== undefined) handle.face(facing);
  const seen: Json[] = [];
  const off = handle.objects.onEvent((event) => {
    if (event.type === "fish_hooked")
      seen.push({ bobber: hex(event.bobber), event: "fish_hooked" });
    else if (event.type === "fish_not_hooked" || event.type === "fish_escaped")
      seen.push({ event: event.type });
  });
  handle.cast(FISHING_SPELL, handle.getControlState().selfGuid);
  if (useAfter !== undefined) {
    await Bun.sleep(useAfter * 1000);
    const bobber = handle.objects.state().fishing?.bobber;
    if (bobber !== undefined) handle.objects.act.use(bobber);
  }
  const deadline = Date.now() + seconds * 1000;
  await settle(() =>
    handle.objects.state().fishing?.bobber === undefined
      ? undefined
      : handle.objects.state().fishing,
  );
  const state = handle.objects.state().fishing;
  let bobber: Json = null;
  if (state?.bobber !== undefined) {
    const guid = bobberArg ?? state.bobber;
    const row = handle.queryNearby().find((near) => near.entity.guid === guid);
    bobber = row ? summary(row) : hex(guid);
  }
  const left = deadline - Date.now();
  if (left > 0) await Bun.sleep(Math.min(left, 1000));
  off();
  const fishing = handle.objects.state().fishing;
  return {
    bobber,
    fishing: fishing
      ? {
          bobber: fishing.bobber === undefined ? null : hex(fishing.bobber),
          phase: fishing.phase,
        }
      : null,
    seen,
  };
}

export const flow: ProbeFlow = {
  name: "objects-fish",
  run,
  usage:
    "--flow objects-fish [--arg seconds=<s>] [--arg bobber=<0x...>] [--arg facing=<radians>] [--arg use=<seconds-after-cast>]: cast Fishing (7620) on yourself, optionally face first and use the own bobber once after <use> seconds, then report the fishing state and the fish events.",
};
