import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ReadyForRedirect,
  WardenRequest,
} from "#wow/areas/guard/protocol";

export type GuardState = {
  warden: { active: boolean; requests: number; firstSize: number | undefined };
  redirect: ReadyForRedirect | undefined;
};

export type GuardEvent =
  | { type: "warden_request"; size: number }
  | { type: "redirect_ready"; ok: boolean }
  | { type: "notification"; text: string };

export class GuardStore {
  private readonly events = new Emitter<[GuardEvent]>();
  private requests = 0;
  private firstSize: number | undefined;
  private redirect: ReadyForRedirect | undefined;

  snapshot(): GuardState {
    return {
      warden: {
        active: this.requests > 0,
        requests: this.requests,
        firstSize: this.firstSize,
      },
      redirect: this.redirect,
    };
  }

  onEvent(cb: (event: GuardEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveWardenRequest(request: WardenRequest): void {
    this.requests += 1;
    if (this.requests > 1) return;
    this.firstSize = request.size;
    this.events.emit({ type: "warden_request", size: request.size });
  }

  receiveRedirectReady(ready: ReadyForRedirect): void {
    this.redirect = ready;
    this.events.emit({ type: "redirect_ready", ok: ready.ok });
  }

  receiveNotification(text: string): void {
    this.events.emit({ type: "notification", text });
  }

  dispose(): void {
    this.events.clear();
  }
}
