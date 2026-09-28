import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AccountDataTimes,
  AddonInfo,
  CharacterLoginFailed,
  ClientCacheVersion,
  FeatureSystemStatus,
  LearnedDanceMoves,
  Pong,
  TutorialFlags,
} from "#wow/areas/login/protocol";

export type LoginState = {
  addons: { count: number; keyed: number; banned: number } | undefined;
  cacheVersion: number | undefined;
  tutorials: readonly number[] | undefined;
  accountDataTimes:
    | {
        serverTime: number;
        mask: number;
        times: readonly (readonly [type: number, time: number])[];
      }
    | undefined;
  features: { complaints: number; voice: number } | undefined;
  danceMoves: readonly [number, number] | undefined;
  link: {
    lastSeq: number;
    rttMs: number | undefined;
    lastPongAt: number | undefined;
  };
};
export type LoginEvent =
  | {
      type: "login_noise";
      addons: number;
      keyed: number;
      cacheVersion: number;
      complaints: number;
      voice: number;
    }
  | { type: "account_data_times"; mask: number }
  | { type: "pong"; seq: number; rttMs: number }
  | { type: "login_failed"; code: number; reason: string }
  | { type: "logout_cancelled" };

const MAX_PENDING_PINGS = 8;

function detach(state: LoginState): LoginState {
  const { addons, tutorials, accountDataTimes, features, danceMoves } = state;
  return {
    ...state,
    addons: addons && { ...addons },
    tutorials: tutorials && [...tutorials],
    accountDataTimes: accountDataTimes && {
      ...accountDataTimes,
      times: accountDataTimes.times.map(([type, time]) => [type, time]),
    },
    features: features && { ...features },
    danceMoves: danceMoves && [danceMoves[0], danceMoves[1]],
    link: { ...state.link },
  };
}

export class LoginStore {
  private readonly events = new Emitter<[LoginEvent]>();
  private noiseSent = false;
  private readonly pending = new Map<number, number>();
  private state: LoginState = {
    addons: undefined,
    cacheVersion: undefined,
    tutorials: undefined,
    accountDataTimes: undefined,
    features: undefined,
    danceMoves: undefined,
    link: { lastSeq: 0, rttMs: undefined, lastPongAt: undefined },
  };

  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  snapshot(): LoginState {
    return detach(this.state);
  }

  onEvent(cb: (event: LoginEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveAddonInfo(packet: AddonInfo): void {
    const addons = {
      count: packet.addons.length,
      keyed: packet.addons.filter((addon) => addon.keyed).length,
      banned: packet.banned.length,
    };
    this.state = { ...this.state, addons };
  }

  receiveClientCacheVersion(packet: ClientCacheVersion): void {
    this.state = { ...this.state, cacheVersion: packet.version };
  }

  receiveTutorialFlags(packet: TutorialFlags): void {
    this.state = { ...this.state, tutorials: [...packet.flags] };
  }

  receiveAccountDataTimes(packet: AccountDataTimes): void {
    this.state = {
      ...this.state,
      accountDataTimes: {
        serverTime: packet.serverTime,
        mask: packet.mask,
        times: packet.times.map(([type, time]) => [type, time]),
      },
    };
    this.events.emit({ type: "account_data_times", mask: packet.mask });
  }

  receiveFeatureSystemStatus(packet: FeatureSystemStatus): void {
    this.state = { ...this.state, features: { ...packet } };
  }

  receiveLearnedDanceMoves(packet: LearnedDanceMoves): void {
    this.state = {
      ...this.state,
      danceMoves: [packet.moves[0], packet.moves[1]],
    };
    if (this.noiseSent) return;
    this.noiseSent = true;
    const { addons, cacheVersion, features } = this.state;
    this.events.emit({
      type: "login_noise",
      addons: addons?.count ?? 0,
      keyed: addons?.keyed ?? 0,
      cacheVersion: cacheVersion ?? 0,
      complaints: features?.complaints ?? 0,
      voice: features?.voice ?? 0,
    });
  }

  nextPing(now: number): { seq: number; latencyMs: number } {
    const seq = this.state.link.lastSeq + 1;
    this.pending.set(seq, now);
    const [oldest] = this.pending.keys();
    if (this.pending.size > MAX_PENDING_PINGS && oldest !== undefined)
      this.pending.delete(oldest);
    this.state = { ...this.state, link: { ...this.state.link, lastSeq: seq } };
    return { seq, latencyMs: this.state.link.rttMs ?? 0 };
  }

  receivePong(packet: Pong): void {
    const sentAt = this.pending.get(packet.seq);
    if (sentAt === undefined) return;
    this.pending.delete(packet.seq);
    const at = this.now();
    const rttMs = at - sentAt;
    this.state = {
      ...this.state,
      link: { ...this.state.link, rttMs, lastPongAt: at },
    };
    this.events.emit({ type: "pong", seq: packet.seq, rttMs });
  }

  receiveCharacterLoginFailed(packet: CharacterLoginFailed): void {
    this.events.emit({ type: "login_failed", ...packet });
  }

  receiveLogoutCancelAck(): void {
    this.events.emit({ type: "logout_cancelled" });
  }

  dispose(): void {
    this.events.clear();
  }
}
