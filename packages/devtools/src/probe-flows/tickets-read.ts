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
  return json({
    ticket: await attempt(() => handle.tickets.act.ticket()),
    ticketSystem: await attempt(() => handle.tickets.act.ticketSystem()),
  });
}

export const flow: ProbeFlow = {
  name: "tickets-read",
  run,
  usage:
    "--flow tickets-read: read the ticket system status and the character's ticket. It writes nothing.",
};
