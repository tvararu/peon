import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AccountDataTimes,
  AddonInfo,
  ClientCacheVersion,
  FeatureSystemStatus,
  LearnedDanceMoves,
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
  | { type: "account_data_times"; mask: number };

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
  };
}

export class LoginStore {
  private readonly events = new Emitter<[LoginEvent]>();
  private noiseSent = false;
  private state: LoginState = {
    addons: undefined,
    cacheVersion: undefined,
    tutorials: undefined,
    accountDataTimes: undefined,
    features: undefined,
    danceMoves: undefined,
  };

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

  dispose(): void {
    this.events.clear();
  }
}
