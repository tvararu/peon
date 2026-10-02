import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  InspectTalent,
  RespondInspectAchievements,
} from "#wow/areas/inspect/protocol";

export type InspectState = Record<never, never>;
export type InspectEvent =
  | { type: "talents"; reply: InspectTalent }
  | { type: "achievements"; reply: RespondInspectAchievements };

export class InspectStore {
  private readonly events = new Emitter<[InspectEvent]>();

  snapshot(): InspectState {
    return {};
  }

  onEvent(cb: (event: InspectEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveTalents(reply: InspectTalent): void {
    this.events.emit({ reply, type: "talents" });
  }

  receiveAchievements(reply: RespondInspectAchievements): void {
    this.events.emit({ reply, type: "achievements" });
  }

  dispose(): void {
    this.events.clear();
  }
}
