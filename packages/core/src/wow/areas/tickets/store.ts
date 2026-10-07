import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  DeleteTicketCode,
  GmResponse,
  GmTicket,
  UpdateTicketCode,
} from "#wow/areas/tickets/protocol";
import type { SessionDeps } from "#wow/session-stores";

export type TicketRecord =
  | { status: "none" }
  | { status: "open"; ticket: GmTicket }
  | { status: "completed"; ticket: GmTicket };

export type TicketsState = {
  systemEnabled: boolean | undefined;
  ticket: TicketRecord | undefined;
  response: GmResponse | undefined;
  surveyOffered: boolean | undefined;
};

export type TicketsEvent =
  | { type: "ticket"; ticket: TicketRecord }
  | { type: "created"; code: number; outcome: string }
  | { type: "updated"; code: number; outcome: string }
  | { type: "deleted"; code: number; outcome: string }
  | { type: "gm_response"; ticketId: number; text: string }
  | { type: "gm_survey"; offered: boolean };

export class TicketsStore {
  private readonly events = new Emitter<[TicketsEvent]>();
  private readonly deps: SessionDeps;
  private systemEnabled: boolean | undefined;
  private ticket: TicketRecord | undefined;
  private response: GmResponse | undefined;
  private surveyOffered: boolean | undefined;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): TicketsState {
    return {
      response: this.response,
      surveyOffered: this.surveyOffered,
      systemEnabled: this.systemEnabled,
      ticket: this.ticket,
    };
  }

  onEvent(cb: (event: TicketsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  dispose(): void {
    this.events.clear();
  }

  receiveSystemStatus(enabled: boolean): void {
    this.systemEnabled = enabled;
  }

  receiveTicket(ticket: TicketRecord): void {
    this.ticket = ticket;
    this.events.emit({ ticket, type: "ticket" });
  }
  receiveGmResponse(response: GmResponse): void {
    this.response = response;
    const current = this.ticket;
    const prior: GmTicket =
      current && current.status !== "none"
        ? current.ticket
        : {
            ageDays: 0,
            escalation: 0,
            id: 0,
            needMoreHelp: false,
            oldestAgeDays: 0,
            readByGm: false,
            text: "",
            updatedAgeDays: 0,
          };
    this.ticket = {
      status: "completed",
      ticket: { ...prior, text: response.text },
    };
    this.events.emit({
      text: response.response,
      ticketId: response.ticketId,
      type: "gm_response",
    });
  }

  receiveCreated(code: number, outcome: string): void {
    this.events.emit({ code, outcome, type: "created" });
  }

  receiveUpdated(reply: UpdateTicketCode): void {
    this.events.emit({
      code: reply.code,
      outcome: reply.outcome,
      type: "updated",
    });
  }

  receiveDeleted(reply: DeleteTicketCode): void {
    if (reply.code === 9) this.ticket = { status: "none" };
    this.events.emit({
      code: reply.code,
      outcome: reply.outcome,
      type: "deleted",
    });
  }

  receiveStatusUpdate(showSurvey: boolean): void {
    this.surveyOffered = showSurvey;
    this.events.emit({ offered: showSurvey, type: "gm_survey" });
  }

  selfPosition(): { map: number; x: number; y: number; z: number } | undefined {
    const position = this.deps.getEntity(this.deps.selfGuid())?.position;
    if (!position) return undefined;
    return { map: position.mapId, x: position.x, y: position.y, z: position.z };
  }
}
