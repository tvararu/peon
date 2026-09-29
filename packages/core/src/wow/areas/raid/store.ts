import type { Unsubscribe } from "#lib/emitter";
import type { RaidGroup } from "#wow/areas/raid/protocol";
import {
  type RaidEvent,
  type RaidState,
  RaidStore,
} from "#wow/areas/raid/store-roster";
import { commandResultEvent } from "#wow/areas/raid/store-structure";
import type { PartyCommandResult } from "#wow/protocol/group";
import type { PartyMemberStats } from "#wow/protocol/group-stats";

export class RaidAreaStore {
  private readonly inner = new RaidStore();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  snapshot(): RaidState {
    return this.inner.snapshot();
  }

  onEvent(cb: (event: RaidEvent) => void): Unsubscribe {
    return this.inner.onEvent(cb);
  }

  receiveList(packet: RaidGroup, counter: number): void {
    this.inner.receiveList(packet, counter);
  }

  receiveInviteBlocked(name: string): void {
    this.inner.receiveInviteBlocked(name);
  }

  receiveCommandResult(parsed: PartyCommandResult): void {
    this.inner.receiveCommandResult(commandResultEvent(parsed));
  }

  receiveStats(stats: PartyMemberStats): void {
    this.inner.receiveStats(stats, this.now());
  }

  dispose(): void {
    this.inner.dispose();
  }
}
