import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  type CompoundMove,
  FLAG_CHANGES,
  type FlagChange,
  type MirrorTimerName,
  type MirrorTimerStart,
  mirrorTimerName,
  type StandStateName,
  standStateName,
  type TransferAborted,
} from "#wow/areas/selfstate/protocol";
import type { MoveCounter } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { TransferAbortedInput } from "#wow/self-store";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type MirrorTimer = {
  readonly valueMs: number;
  readonly maxMs: number;
  readonly scale: number;
  readonly paused: boolean;
  readonly spellId: number;
  readonly at: number;
};
export type MirrorTimers = Readonly<
  Partial<Record<MirrorTimerName, MirrorTimer>>
>;
export type SelfstateState = {
  readonly standState: StandStateName | undefined;
  readonly timers: MirrorTimers;
  readonly ghostPending: boolean;
  readonly lastTransferAbort: TransferAbort | undefined;
};
export type TransferAbort = TransferAborted & { readonly at: number };
export type SelfstateEvent =
  | {
      type: "stand_changed";
      from: StandStateName | undefined;
      to: StandStateName;
    }
  | ({ type: "transfer_aborted" } & TransferAbort)
  | {
      type: "mirror_timer";
      timer: MirrorTimerName;
      change: "started";
      value: MirrorTimer;
    }
  | { type: "mirror_timer"; timer: MirrorTimerName; change: "stopped" }
  | { type: "breath_low"; remainingMs: number }
  | { type: "ghost_pending" };

export class SelfstateStore {
  private readonly events = new Emitter<[SelfstateEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private standState: StandStateName | undefined;
  private timers: MirrorTimers = {};
  private ghostPending = false;
  private lastTransferAbort: TransferAbort | undefined;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): SelfstateState {
    return {
      standState: this.standState,
      timers: { ...this.timers },
      ghostPending: this.ghostPending,
      lastTransferAbort: this.lastTransferAbort,
    };
  }

  onEvent(cb: (event: SelfstateEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveMoveFlag(change: FlagChange, { guid, counter }: MoveCounter): void {
    if (guid !== this.deps.selfGuid()) return;
    this.core.self.receive({
      type: "move_flag",
      flag: change.flag,
      enable: change.enable,
      counter,
    });
  }

  receiveMultipleMoves(entries: readonly CompoundMove[]): void {
    for (const { opcode, guid, counter } of entries) {
      if (opcode === GameOpcode.SMSG_FORCE_MOVE_ROOT) {
        if (guid === this.deps.selfGuid())
          this.core.self.receive({ type: "force_root", counter });
        continue;
      }
      const change = FLAG_CHANGES.get(opcode);
      if (change) this.receiveMoveFlag(change, { guid, counter });
    }
  }

  receiveStandState(value: number): void {
    const to = standStateName(value);
    if (!to || to === this.standState) return;
    const from = this.standState;
    this.standState = to;
    this.events.emit({ type: "stand_changed", from, to });
  }

  syncStandField(value: number): void {
    if (this.standState === undefined) {
      this.standState = standStateName(value);
      return;
    }
    this.receiveStandState(value);
  }

  receiveMirrorTimer({ timer, ...start }: MirrorTimerStart): void {
    const name = mirrorTimerName(timer);
    if (!name) return;
    const value = { ...start, at: this.deps.now() };
    this.timers = { ...this.timers, [name]: value };
    this.events.emit({
      type: "mirror_timer",
      timer: name,
      change: "started",
      value,
    });
  }

  receiveStopMirrorTimer(timer: number): void {
    const name = mirrorTimerName(timer);
    if (!(name && this.timers[name])) return;
    const { [name]: _, ...rest } = this.timers;
    this.timers = rest;
    this.events.emit({ type: "mirror_timer", timer: name, change: "stopped" });
  }

  receiveTransferAborted({ arg, mapId, reason }: TransferAbortedInput): void {
    const abort: TransferAbort = { arg, at: this.deps.now(), mapId, reason };
    this.lastTransferAbort = abort;
    this.events.emit({ ...abort, type: "transfer_aborted" });
    this.core.self.receive({ ...abort, type: "transfer_aborted" });
  }

  receivePreResurrect(guid: bigint): void {
    if (guid !== this.deps.selfGuid()) return;
    this.ghostPending = true;
    this.events.emit({ type: "ghost_pending" });
  }

  clearGhostPending(): void {
    this.ghostPending = false;
  }

  breathLow(remainingMs: number): void {
    this.events.emit({ type: "breath_low", remainingMs });
  }

  dispose(): void {
    this.events.clear();
  }
}
