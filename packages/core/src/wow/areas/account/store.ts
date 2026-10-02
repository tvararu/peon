import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  UpdateAccountData,
  UpdateAccountDataComplete,
} from "#wow/areas/account/protocol";

export type AccountEntry = { type: number; time: number; text: string };
export type AccountState = {
  data: readonly AccountEntry[];
  lastSaved: number | undefined;
};
export type AccountEvent =
  | { type: "account_data"; dataType: number; time: number; bytes: number }
  | { type: "account_data_saved"; dataType: number };

function detach(state: AccountState): AccountState {
  return {
    data: state.data.map((entry) => ({ ...entry })),
    lastSaved: state.lastSaved,
  };
}

export class AccountStore {
  private readonly events = new Emitter<[AccountEvent]>();
  private state: AccountState = { data: [], lastSaved: undefined };

  snapshot(): AccountState {
    return detach(this.state);
  }

  onEvent(cb: (event: AccountEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveUpdate(packet: UpdateAccountData): void {
    const entry: AccountEntry = {
      text: packet.text,
      time: packet.time,
      type: packet.type,
    };
    const data = this.state.data.filter((other) => other.type !== entry.type);
    this.state = { ...this.state, data: [...data, entry] };
    this.events.emit({
      bytes: new TextEncoder().encode(entry.text).byteLength,
      dataType: entry.type,
      time: entry.time,
      type: "account_data",
    });
  }

  receiveComplete(packet: UpdateAccountDataComplete): void {
    this.state = { ...this.state, lastSaved: packet.type };
    this.events.emit({ dataType: packet.type, type: "account_data_saved" });
  }

  dispose(): void {
    this.events.clear();
  }
}
