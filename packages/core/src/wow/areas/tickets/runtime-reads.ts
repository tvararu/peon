import type { TicketsCtx } from "#wow/areas/tickets/runtime-shared";
import { TICKETS_ANSWER_MS } from "#wow/areas/tickets/runtime-shared";
import type { TicketRecord, TicketsStore } from "#wow/areas/tickets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type TicketQueryResult = { enabled: boolean };

export type TicketsReadActs = {
  ticketSystem: () => Promise<TicketQueryResult>;
  ticket: () => Promise<TicketRecord | undefined>;
};

export function ticketsReadActs(
  ctx: TicketsCtx,
  store: TicketsStore,
): TicketsReadActs {
  async function ticketSystem(): Promise<TicketQueryResult> {
    const answered = ctx.until((incoming) => incoming.type === "ticket", {
      signal: ctx.signal,
      timeoutMs: TICKETS_ANSWER_MS,
    });
    ctx.send(GameOpcode.CMSG_GMTICKET_SYSTEMSTATUS);
    await answered;
    return { enabled: store.snapshot().systemEnabled ?? false };
  }

  async function ticket(): Promise<TicketRecord | undefined> {
    const answered = ctx.until(
      (incoming) =>
        incoming.type === "ticket" || incoming.type === "gm_response",
      { signal: ctx.signal, timeoutMs: TICKETS_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_GMTICKET_GETTICKET);
    await answered;
    return store.snapshot().ticket;
  }

  return { ticket, ticketSystem };
}
