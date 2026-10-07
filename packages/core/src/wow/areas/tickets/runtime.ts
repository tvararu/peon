import type { AreaRuntime } from "#wow/areas/contract";
import type { TicketsReadActs } from "#wow/areas/tickets/runtime-reads";
import { ticketsReadActs } from "#wow/areas/tickets/runtime-reads";
import type { TicketsResponseActs } from "#wow/areas/tickets/runtime-response";
import { ticketsResponseActs } from "#wow/areas/tickets/runtime-response";
import type { TicketsCtx } from "#wow/areas/tickets/runtime-shared";
import type { TicketsWriteActs } from "#wow/areas/tickets/runtime-writes";
import { ticketsWriteActs } from "#wow/areas/tickets/runtime-writes";
import type { TicketsStore } from "#wow/areas/tickets/store";
import type { CoreStores } from "#wow/session-stores";

export type {
  TicketQueryResult,
  TicketsReadActs,
} from "#wow/areas/tickets/runtime-reads";
export type {
  ResolveGmResponseResult,
  TicketsResponseActs,
} from "#wow/areas/tickets/runtime-response";
export type { TicketsCtx } from "#wow/areas/tickets/runtime-shared";
export type {
  AbandonTicketResult,
  CreateTicketArgs,
  CreateTicketResult,
  TicketsWriteActs,
  UpdateTicketResult,
} from "#wow/areas/tickets/runtime-writes";
export type TicketsActs = TicketsReadActs &
  TicketsWriteActs &
  TicketsResponseActs;

export function ticketsRuntime(
  ctx: TicketsCtx,
  store: TicketsStore,
  _core: CoreStores,
): AreaRuntime<TicketsActs> {
  return {
    act: {
      ...ticketsReadActs(ctx, store),
      ...ticketsWriteActs(ctx, store),
      ...ticketsResponseActs(ctx),
    },
    dispose: () => undefined,
  };
}
