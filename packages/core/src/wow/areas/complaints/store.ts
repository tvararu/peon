import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ComplaintsState,
  ComplaintsEvent as ExternalComplaintsEvent,
} from "#wow/areas/complaints/types";

export type ComplaintsEvent = ExternalComplaintsEvent;

export class ComplaintStore {
  private readonly events = new Emitter<[ComplaintsEvent]>();
  private readonly codes: number[] = [];

  snapshot(): ComplaintsState {
    return { received: [...this.codes] };
  }

  onEvent(cb: (event: ComplaintsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  received(packet: { code: number }): void {
    this.codes.push(packet.code);
    this.events.emit({ type: "complaint_received", code: packet.code });
  }

  dispose(): void {
    this.events.clear();
    this.codes.length = 0;
  }
}
