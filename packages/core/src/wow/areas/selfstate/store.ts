import { Emitter, type Unsubscribe } from "#lib/emitter";
import { selfFields, UNIT_FLAG_MOUNT } from "#wow/areas/selfstate/fields";
import {
  type CollisionHeight,
  type CompoundMove,
  type CorpseMapPosition,
  FLAG_CHANGES,
  type FlagChange,
  type MirrorTimerName,
  type MirrorTimerStart,
  mirrorTimerName,
  type StandStateName,
  standStateName,
  type TransferAborted,
} from "#wow/areas/selfstate/protocol";
import { type PlayerLife, readLife } from "#wow/player-state";
import { UnitFlag } from "#wow/protocol/entity-fields";
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
  readonly collisionHeight: number | undefined;
  readonly selfResSpell: number;
  readonly mounted: boolean;
  readonly mountDisplayId: number;
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
  | { type: "ghost_pending" }
  | { type: "mounted"; displayId: number; taxi: boolean }
  | { type: "dismounted"; taxi: boolean }
  | { type: "mount_anim"; guid: bigint }
  | { type: "self_res_available"; spellId: number; name: string | undefined };

export class SelfstateStore {
  private readonly events = new Emitter<[SelfstateEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private standState: StandStateName | undefined;
  private timers: MirrorTimers = {};
  private ghostPending = false;
  private lastTransferAbort: TransferAbort | undefined;
  private collisionHeight: number | undefined;
  private readonly corpseReplies = new Emitter<[CorpseMapPosition]>();
  private selfResSpell = 0;
  private mountKnown = false;
  private mountDisplayId = 0;
  private taxi = false;
  private dismountUnconfirmed = false;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): SelfstateState {
    return {
      collisionHeight: this.collisionHeight,
      mountDisplayId: this.mountDisplayId,
      mounted: this.mountDisplayId !== 0,
      selfResSpell: this.selfResSpell,
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
    this.core.self.receive({
      type: "move_flag",
      flag: change.flag,
      enable: change.enable,
      counter,
      guid,
    });
  }

  receiveCollisionHeight({ guid, counter, height }: CollisionHeight): void {
    if (guid !== this.deps.selfGuid()) return;
    this.collisionHeight = height;
    this.core.self.receive({ type: "collision_height", counter, height });
  }

  receiveMultipleMoves(entries: readonly CompoundMove[]): void {
    for (const { opcode, guid, counter } of entries) {
      if (opcode === GameOpcode.SMSG_FORCE_MOVE_ROOT) {
        if (guid === this.deps.selfGuid())
          this.core.self.receive({ type: "force_root", counter, guid });
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

  syncMountFields(
    unitFlags: number | undefined,
    displayId: number | undefined,
    fresh: boolean,
  ): void {
    if (unitFlags === undefined || displayId === undefined) return;
    const mounted = (unitFlags & UNIT_FLAG_MOUNT) !== 0 && displayId !== 0;
    const taxi = (unitFlags & UnitFlag.TAXI_FLIGHT) !== 0;
    if (this.dismountUnconfirmed && mounted && !fresh) return;
    this.dismountUnconfirmed = false;
    const displayIdNow = mounted ? displayId : 0;
    const was = this.mountDisplayId !== 0;
    const taxiBefore = this.taxi;
    const known = this.mountKnown;
    this.mountKnown = true;
    this.mountDisplayId = displayIdNow;
    this.taxi = taxi;
    if (!known || mounted === was) return;
    if (mounted) this.events.emit({ type: "mounted", displayId, taxi });
    else this.events.emit({ type: "dismounted", taxi: taxiBefore });
  }

  receiveDismount(guid: bigint): void {
    if (guid !== this.deps.selfGuid() || this.mountDisplayId === 0) return;
    this.dismountUnconfirmed = true;
    this.mountDisplayId = 0;
    this.events.emit({ type: "dismounted", taxi: this.taxi });
  }

  receiveMountAnim(guid: bigint): void {
    if (guid === this.deps.selfGuid()) return;
    this.events.emit({ type: "mount_anim", guid });
  }

  inFlight(): boolean {
    return this.taxi;
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

  life(): PlayerLife {
    return readLife(this.deps.selfGuid(), this.deps.getEntity).life;
  }

  currentSelfResSpell(): number {
    const guid = this.deps.selfGuid();
    return selfFields(this.deps.getEntity(guid), guid)?.selfResSpell ?? 0;
  }

  syncSelfResSpell(spellId: number): boolean {
    const appeared = this.selfResSpell === 0 && spellId !== 0;
    this.selfResSpell = spellId;
    return appeared;
  }

  selfResAvailable(spellId: number, name: string | undefined): void {
    this.events.emit({ type: "self_res_available", spellId, name });
  }
  breathLow(remainingMs: number): void {
    this.events.emit({ type: "breath_low", remainingMs });
  }
  onCorpseMapPosition(cb: (position: CorpseMapPosition) => void): Unsubscribe {
    return this.corpseReplies.subscribe(cb);
  }
  receiveCorpseMapPosition(position: CorpseMapPosition): void {
    this.corpseReplies.emit(position);
  }

  dispose(): void {
    this.events.clear();
    this.corpseReplies.clear();
  }
}
