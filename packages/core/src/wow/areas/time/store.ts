import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  LoginSetTimeSpeed,
  TimeQueryResponse,
} from "#wow/areas/time/protocol";
import type { PackedTime } from "#wow/protocol/packed-time";

export type TimeState = {
  gameTime: PackedTime | undefined;
  speed: number | undefined;
  serverTime: number | undefined;
  dailyResetInSec: number | undefined;
  receivedAt: number | undefined;
};
export type TimeEvent = {
  type: "set_speed" | "query_reply";
  state: TimeState;
};

function detach(state: TimeState): TimeState {
  return {
    ...state,
    gameTime: state.gameTime && { ...state.gameTime },
  };
}

export class TimeStore {
  private readonly events = new Emitter<[TimeEvent]>();
  private state: TimeState = {
    gameTime: undefined,
    speed: undefined,
    serverTime: undefined,
    dailyResetInSec: undefined,
    receivedAt: undefined,
  };

  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  snapshot(): TimeState {
    return detach(this.state);
  }

  onEvent(cb: (event: TimeEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveSetSpeed(packet: LoginSetTimeSpeed): void {
    this.state = {
      ...this.state,
      gameTime: { ...packet.gameTime },
      speed: packet.speed,
      receivedAt: this.now(),
    };
    this.events.emit({ type: "set_speed", state: this.snapshot() });
  }

  receiveQueryReply(packet: TimeQueryResponse): void {
    this.state = {
      ...this.state,
      serverTime: packet.serverTime,
      dailyResetInSec: packet.dailyResetInSec,
      receivedAt: this.now(),
    };
    this.events.emit({ type: "query_reply", state: this.snapshot() });
  }

  dispose(): void {
    this.events.clear();
  }
}
