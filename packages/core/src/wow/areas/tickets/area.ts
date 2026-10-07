import { defineArea } from "#wow/areas/contract";
import { TICKETS_OPCODES } from "#wow/areas/tickets/opcodes";
import {
  parseCreateReply,
  parseDeleteReply,
  parseGetTicket,
  parseGmResponse,
  parseStatusUpdate,
  parseSystemStatus,
  parseUpdateReply,
} from "#wow/areas/tickets/protocol";
import { ticketsRuntime } from "#wow/areas/tickets/runtime";
import { TicketsStore } from "#wow/areas/tickets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const ticketsArea = defineArea({
  eventTypes: [
    "ticket",
    "created",
    "updated",
    "deleted",
    "gm_response",
    "gm_survey",
  ],
  name: "tickets",
  opcodes: TICKETS_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_GMTICKET_SYSTEMSTATUS, (reader) => {
      store.receiveSystemStatus(parseSystemStatus(reader).enabled);
    });
    wire.on(GameOpcode.SMSG_GMTICKET_GETTICKET, (reader) => {
      const got = parseGetTicket(reader);
      if (got.status === "none") store.receiveTicket({ status: "none" });
      else if (got.status === "open")
        store.receiveTicket({ status: "open", ticket: got.ticket });
    });
    wire.on(GameOpcode.SMSG_GMTICKET_CREATE, (reader) => {
      const reply = parseCreateReply(reader);
      store.receiveCreated(reply.code, reply.outcome);
    });
    wire.on(GameOpcode.SMSG_GMTICKET_UPDATETEXT, (reader) => {
      store.receiveUpdated(parseUpdateReply(reader));
    });
    wire.on(GameOpcode.SMSG_GMTICKET_DELETETICKET, (reader) => {
      store.receiveDeleted(parseDeleteReply(reader));
    });
    wire.on(GameOpcode.SMSG_GMRESPONSE_RECEIVED, (reader) => {
      store.receiveGmResponse(parseGmResponse(reader));
    });
    wire.on(GameOpcode.SMSG_GMRESPONSE_STATUS_UPDATE, (reader) => {
      store.receiveStatusUpdate(parseStatusUpdate(reader).showSurvey);
    });
  },
  runtime: ticketsRuntime,
  store: (deps) => new TicketsStore(deps),
});
