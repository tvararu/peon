import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const STEPS = ["list", "hello", "join", "join-again", "status", "leave"];
const DEFAULT_BG = "2";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

type Attempt = { result: Json } | { error: string };

async function attempt(action: () => Promise<unknown>): Promise<Attempt> {
  try {
    return { result: json(await action()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function bgOf(args: Readonly<Record<string, string>>): number {
  const bg = Number(args["bg"] ?? DEFAULT_BG);
  if (!Number.isInteger(bg) || bg < 0)
    throw new Error(
      `battlegrounds-queue needs bg=<battlemaster list id>, not "${args["bg"]}".`,
    );
  return bg;
}

async function hello({ handle, args, settle }: FlowContext): Promise<Json> {
  const master = () => {
    const found = others(handle).filter((near) =>
      near.roles.some((role) => role === "battlemaster"),
    );
    return found.at(0);
  };
  const given = args["guid"];
  const row = given === undefined ? await settle(master) : undefined;
  const guid = given === undefined ? row?.entity.guid : BigInt(given);
  if (guid === undefined)
    throw new Error(
      "battlegrounds-queue hello needs a battlemaster in view or guid=<guid>.",
    );
  return json({
    master: row ? summary(row) : null,
    ...(await attempt(() => handle.battlegrounds.act.hello(guid))),
  });
}

async function leave({ handle, args }: FlowContext): Promise<Json> {
  const slots = handle.battlegrounds.state().queue.slots;
  const slot =
    args["slot"] === undefined
      ? slots.findIndex((entry) => entry.kind === "queued")
      : Number(args["slot"]);
  return json({
    slot,
    ...(await attempt(() => handle.battlegrounds.act.leaveQueue(slot))),
  });
}

async function run(ctx: FlowContext): Promise<Json> {
  const step = ctx.args["step"] ?? "";
  const { handle } = ctx;
  if (step === "list")
    return json(
      await attempt(() => handle.battlegrounds.act.list(bgOf(ctx.args))),
    );
  if (step === "hello") return hello(ctx);
  if (step === "join" || step === "join-again")
    return json({
      step,
      ...(await attempt(() => handle.battlegrounds.act.join(bgOf(ctx.args)))),
    });
  if (step === "status")
    return json({ queue: handle.battlegrounds.state().queue });
  if (step === "leave") return leave(ctx);
  throw new Error(
    `battlegrounds-queue needs step=${STEPS.join("|")}, not "${step}".`,
  );
}

export const flow: ProbeFlow = {
  name: "battlegrounds-queue",
  run,
  usage:
    "--flow battlegrounds-queue --arg step=<list, hello, join, join-again, status or leave>, with optional bg, guid and slot args. One step per flow run; repeat --flow in one probe to keep the queue. status reports the queue state after a --send CMSG_BATTLEFIELD_STATUS.",
};
