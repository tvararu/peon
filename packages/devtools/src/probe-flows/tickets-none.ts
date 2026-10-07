import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

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

async function run(ctx: FlowContext) {
  const handle: WorldHandle = ctx.handle;
  const text = String(ctx.args["text"] ?? "peon probe");
  const ticket = await attempt(() => handle.tickets.act.ticket());
  const update = await attempt(() => handle.tickets.act.updateTicket(text));
  const abandon = await attempt(() => handle.tickets.act.abandonTicket());
  const resolve = await attempt(() => handle.tickets.act.resolveGmResponse());
  return json({ abandon, resolve, ticket, update });
}

export const flow: ProbeFlow = {
  name: "tickets-none",
  run,
  usage:
    "--flow tickets-none [--arg text=<text>]: read the ticket, then update, abandon and resolve it. With no ticket every write answers nothing.",
};
