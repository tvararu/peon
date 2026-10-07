import {
  buildCreateTicket,
  buildUpdateText,
  type CreateTicketFields,
} from "#wow/areas/tickets/protocol";
import type { TicketsCtx } from "#wow/areas/tickets/runtime-shared";
import { waitFor } from "#wow/areas/tickets/runtime-shared";
import type { TicketsStore } from "#wow/areas/tickets/store";
import { cleanText } from "#wow/areas/tickets/text";
import { GameOpcode } from "#wow/protocol/opcodes";

export type CreateTicketArgs = { text: string; needMoreHelp: boolean };

export type CreateTicketResult =
  | { status: "created"; outcome: string }
  | { status: "no_reply" };

export type UpdateTicketResult =
  | { status: "updated"; outcome: string }
  | { status: "no_reply" };

export type AbandonTicketResult =
  | { status: "deleted"; outcome: string }
  | { status: "none"; outcome: "no_reply" };

export type TicketsWriteActs = {
  createTicket: (args: CreateTicketArgs) => Promise<CreateTicketResult>;
  updateTicket: (text: string) => Promise<UpdateTicketResult>;
  abandonTicket: () => Promise<AbandonTicketResult>;
};

export function ticketsWriteActs(
  ctx: TicketsCtx,
  store: TicketsStore,
): TicketsWriteActs {
  async function createTicket(
    args: CreateTicketArgs,
  ): Promise<CreateTicketResult> {
    const position = store.selfPosition();
    if (!position) throw new Error("no_position");
    const fields: CreateTicketFields = {
      map: position.map,
      needMoreHelp: args.needMoreHelp,
      needResponse: true,
      text: cleanText(args.text),
      x: position.x,
      y: position.y,
      z: position.z,
    };
    const reply = await waitFor(
      ctx,
      (incoming) => incoming.type === "created",
      () =>
        ctx.send(GameOpcode.CMSG_GMTICKET_CREATE, buildCreateTicket(fields)),
    );
    if (reply?.type !== "created") return { status: "no_reply" };
    return { outcome: reply.outcome, status: "created" };
  }

  async function updateTicket(text: string): Promise<UpdateTicketResult> {
    const reply = await waitFor(
      ctx,
      (incoming) => incoming.type === "updated",
      () =>
        ctx.send(GameOpcode.CMSG_GMTICKET_UPDATETEXT, buildUpdateText(text)),
    );
    if (reply?.type !== "updated") return { status: "no_reply" };
    return { outcome: reply.outcome, status: "updated" };
  }

  async function abandonTicket(): Promise<AbandonTicketResult> {
    const reply = await waitFor(
      ctx,
      (incoming) => incoming.type === "deleted",
      () => ctx.send(GameOpcode.CMSG_GMTICKET_DELETETICKET),
    );
    if (reply?.type !== "deleted")
      return { outcome: "no_reply", status: "none" };
    return { outcome: reply.outcome, status: "deleted" };
  }

  return { abandonTicket, createTicket, updateTicket };
}
