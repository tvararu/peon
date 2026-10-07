import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const MODES = ["queue-exit", "war"];
const DEFAULT_WAIT_SECONDS = 1800;
const POLL_MS = 500;

type Phase = ReturnType<WorldHandle["wintergrasp"]["state"]>["phase"];

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function attempt(action: () => Promise<unknown>): Promise<Json> {
  try {
    return json({ result: await action() });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function until(
  handle: WorldHandle,
  phase: Phase,
  seconds: number,
): Promise<boolean> {
  const deadline = Date.now() + seconds * 1000;
  while (handle.wintergrasp.state().phase !== phase) {
    if (Date.now() > deadline) return false;
    await Bun.sleep(POLL_MS);
  }
  return true;
}

async function queueExit({ handle, args }: FlowContext): Promise<Json> {
  const seconds = Number(args["wait"] ?? DEFAULT_WAIT_SECONDS);
  const offered = await until(handle, "queue_offered", seconds);
  if (!offered) return json({ offered, state: handle.wintergrasp.state() });
  const accepted = await attempt(() =>
    handle.wintergrasp.act.answerQueue(true),
  );
  const exited = await attempt(() => handle.wintergrasp.act.exitQueue());
  return json({ accepted, exited, offered, state: handle.wintergrasp.state() });
}

async function war({ handle, args }: FlowContext): Promise<Json> {
  const seconds = Number(args["wait"] ?? DEFAULT_WAIT_SECONDS);
  const offered = await until(handle, "queue_offered", seconds);
  if (!offered) return json({ offered, state: handle.wintergrasp.state() });
  const accepted = await attempt(() =>
    handle.wintergrasp.act.answerQueue(true),
  );
  const invited = await until(handle, "entry_offered", seconds);
  if (!invited)
    return json({
      accepted,
      invited,
      offered,
      state: handle.wintergrasp.state(),
    });
  const entered = await attempt(() => handle.wintergrasp.act.answerEntry(true));
  const stay = Number(args["stay"] ?? 20);
  await Bun.sleep(stay * 1000);
  const hearth = await attempt(() =>
    handle.wintergrasp.act.hearthAndResurrect(),
  );
  return json({
    accepted,
    entered,
    hearth,
    invited,
    offered,
    state: handle.wintergrasp.state(),
  });
}

function run(ctx: FlowContext): Promise<Json> {
  const mode = ctx.args["mode"] ?? "";
  if (mode === "queue-exit") return queueExit(ctx);
  if (mode === "war") return war(ctx);
  throw new Error(
    `wintergrasp-window needs mode=${MODES.join("|")}, not "${mode}".`,
  );
}

export const flow: ProbeFlow = {
  name: "wintergrasp-window",
  run,
  usage:
    "--flow wintergrasp-window --arg mode=<how>: " +
    "stand in Wintergrasp, wait for the queued or war offer, " +
    "then leave the queue or join and hearth out.",
};
