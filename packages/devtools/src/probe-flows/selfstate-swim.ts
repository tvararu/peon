import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const DEFAULT_HOLD_MS = 2000;
const MAX_MS = 10_000;
const LEVEL_PITCH = 0.25;

function msOf(
  args: Readonly<Record<string, string>>,
  name: string,
  fallback: number,
  min: number,
): number {
  const ms = Number(args[name] ?? fallback);
  if (!Number.isInteger(ms) || ms < min || ms > MAX_MS)
    throw new Error(
      `selfstate-swim needs ${name}=<${min}-${MAX_MS} ms>, not "${args[name]}".`,
    );
  return ms;
}

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"]);
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `selfstate-swim mode=fly needs spell=<flying mount id>, not "${args["spell"]}".`,
    );
  return spell;
}

function pose(handle: WorldHandle): Json {
  const state = handle.getControlState();
  return {
    blocked: state.blockedReason ?? null,
    z: state.pose?.z ?? null,
  };
}

async function swim(handle: WorldHandle, holdMs: number): Promise<Json> {
  const steps: Json[] = [];
  handle.setSwimming(true);
  try {
    steps.push({ swimming: pose(handle) });
    handle.pitch("up");
    await Bun.sleep(holdMs);
    handle.pitch("stop");
    handle.pitch("down");
    await Bun.sleep(holdMs);
    handle.pitch("stop");
    handle.pitch(LEVEL_PITCH);
    await Bun.sleep(holdMs);
  } finally {
    handle.setSwimming(false);
  }
  steps.push({ landed: pose(handle) });
  return steps;
}

async function takeOff({ handle, settle }: FlowContext): Promise<boolean> {
  const flying = await settle(() => {
    try {
      handle.setFlying(true);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "cannot_fly") return;
      throw error;
    }
  });
  return flying === true;
}

async function fly(ctx: FlowContext, holdMs: number): Promise<Json> {
  const { handle, settle, args } = ctx;
  const spell = spellOf(args);
  await handle.loadCatalogs();
  handle.cast(spell, 0n);
  const mounted = await settle(() =>
    handle.selfstate.state().mounted ? true : undefined,
  );
  if (!mounted)
    throw new Error(`selfstate-swim never mounted after casting ${spell}.`);
  try {
    if (!(await takeOff(ctx)))
      throw new Error(
        "selfstate-swim got no SMSG_MOVE_SET_CAN_FLY after the mount.",
      );
    const steps: Json[] = [{ flying: pose(handle) }];
    try {
      handle.ascend("start");
      await Bun.sleep(holdMs);
      handle.ascend("stop");
      steps.push({ ascended: pose(handle) });
      handle.descend();
      await Bun.sleep(holdMs);
      handle.ascend("stop");
      steps.push({ descended: pose(handle) });
    } finally {
      handle.setFlying(false);
    }
    return steps;
  } finally {
    await handle.selfstate.act.dismount();
  }
}

async function run(ctx: FlowContext): Promise<Json> {
  const holdMs = msOf(ctx.args, "hold", DEFAULT_HOLD_MS, 1);
  const leadMs = msOf(ctx.args, "lead", 0, 0);
  const mode = ctx.args["mode"] ?? "swim";
  if (mode !== "swim" && mode !== "fly")
    throw new Error(
      `selfstate-swim needs mode=swim or mode=fly, not "${mode}".`,
    );
  await Bun.sleep(leadMs);
  const steps =
    mode === "swim" ? await swim(ctx.handle, holdMs) : await fly(ctx, holdMs);
  return { mode, steps };
}

export const flow: ProbeFlow = {
  name: "selfstate-swim",
  run,
  usage:
    "--flow selfstate-swim [--arg mode=swim|fly] [--arg hold=<ms>] [--arg lead=<ms>] [--arg spell=<flying mount id>]: mode swim (default) sends MSG_MOVE_START_SWIM, pitches up, down and to a set pitch with a hold between each, then MSG_MOVE_STOP_SWIM; mode fly casts the mount spell, waits for CAN_FLY, sends CMSG_MOVE_SET_FLY, ascends, descends and lands. lead waits that long after login before the first send, so a witness in view has the character's object by then.",
};
