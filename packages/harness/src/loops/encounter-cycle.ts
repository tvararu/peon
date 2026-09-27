import {
  type ControlEvent,
  type ControlState,
  type EntityEvent,
  type EntityLookup,
  type RecoveryEvent,
  type RewardsEvent,
  snapshotEntityEvent,
} from "@peon/core";
import { Emitter, type Unsubscribe } from "@peon/core/lib/emitter";
import { messageOf } from "@peon/core/lib/errors";
import { JEV_UNAVAILABLE, JevUnavailableError } from "#harness/jev/failure";
import { type CycleRecovery, recoverCorpse } from "#harness/loops/corpse-run";
import type { CycleApproach } from "#harness/loops/cycle-approach";
import type { PullGate } from "#harness/loops/cycle-gate";
import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";
import { vetTarget } from "#harness/loops/cycle-vet";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootCorpse } from "#harness/loops/loot-run";
import type {
  ControlPort,
  RecoveryPort,
  RewardsPort,
} from "#harness/loops/ports";
import {
  type ObjectivePick,
  type ObjectiveProgress,
  outOfReach,
} from "#harness/loops/quest-objective";
import type {
  TacticsLoop,
  TacticsOutcome,
  TacticsState,
} from "#harness/loops/tactics";

export type CyclePhase =
  | "idle"
  | "fighting"
  | "looting"
  | "recovering"
  | "stopped";
export type CycleTargetRecord = {
  guid: bigint;
  status: "queued" | "done" | "skipped";
  cause?: string;
  outcome?: TacticsOutcome;
  loot?: "looted" | "none";
};
export type CycleLootRecord = {
  guid: string;
  slotsTaken: number[];
  slotsLeft: number[];
  moneyTaken: number;
  coinageBefore: number | undefined;
  coinageAfter: number | undefined;
};
export type CycleState = {
  active: boolean;
  phase: CyclePhase;
  queue: CycleTargetRecord[];
  currentIndex: number;
  instruction: string;
  maxStarts: number;
  startsUsed: number;
  stopCause: string | undefined;
  stopDetail: Record<string, unknown> | undefined;
  startedAt: number | undefined;
  lastLoot: CycleLootRecord | undefined;
  lastRecovery: (CycleRecovery & { at: number }) | undefined;
  objective: ObjectiveProgress | undefined;
};
export type CycleObjective = {
  pick: (tried: ReadonlySet<bigint>) => ObjectivePick;
  progress: () => ObjectiveProgress | undefined;
};
export type CycleEvent = {
  type:
    | "started"
    | "target_done"
    | "loot_done"
    | "recovery"
    | "recovered"
    | "stopped";
  state: CycleState;
  at: number;
};
export type CycleDeps = {
  tactics: Pick<TacticsLoop, "start" | "stop"> & {
    snapshot: () => Pick<TacticsState, "lastOutcome">;
  };
  rewards: RewardsPort;
  bags: {
    questItems: () => ReadonlySet<number>;
    stackSize: (entry: number) => Promise<number | undefined>;
  };
  recovery: RecoveryPort;
  control: Pick<ControlPort, "face" | "move"> & {
    snapshot: () => Pick<ControlState, "pose" | "selfGuid" | "speed">;
  };
  entity: EntityLookup;
  approach?: CycleApproach;
  gate?: PullGate;
  now: () => number;
};

const DEFAULT_MAX_STARTS = 10;

export class EncounterCycleRuntime {
  private readonly deps: CycleDeps;
  private readonly events = new Emitter<[CycleEvent]>();
  private run: AbortController | undefined;
  private disposed = false;
  private recoveryEvents: EventWaiter<RecoveryEvent> | undefined;
  private motionEvents: EventWaiter<ControlEvent> | undefined;
  private rewardsEvents: EventWaiter<RewardsEvent> | undefined;
  private bodyEvents:
    | { guid: bigint; waiter: EventWaiter<EntityEvent> }
    | undefined;
  private state: CycleState = {
    active: false,
    phase: "idle",
    queue: [],
    currentIndex: 0,
    instruction: "",
    maxStarts: DEFAULT_MAX_STARTS,
    startsUsed: 0,
    stopCause: undefined,
    stopDetail: undefined,
    startedAt: undefined,
    lastLoot: undefined,
    lastRecovery: undefined,
    objective: undefined,
  };
  private objective: CycleObjective | undefined;

  constructor(deps: CycleDeps) {
    this.deps = deps;
  }

  snapshot(): CycleState {
    return {
      ...this.state,
      queue: this.state.queue.map((record) => ({ ...record })),
    };
  }

  onEvent(listener: (event: CycleEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  observeRecovery(event: RecoveryEvent): void {
    this.recoveryEvents?.push(event);
  }

  observeControl(event: ControlEvent): void {
    this.motionEvents?.push(event);
  }

  observeRewards(event: RewardsEvent): void {
    this.rewardsEvents?.push(event);
  }

  observeEntity(event: EntityEvent): void {
    const guid = event.type === "disappear" ? event.guid : event.entity.guid;
    if (guid === this.bodyEvents?.guid)
      this.bodyEvents.waiter.push(snapshotEntityEvent(event));
  }

  async start(args: {
    guids: bigint[];
    instruction: string;
    maxStarts?: number;
    objective?: CycleObjective;
  }): Promise<void> {
    if (this.disposed) throw new Error("cycle_disposed");
    if (args.guids.length === 0 && !args.objective)
      throw new Error("cycle_empty_queue");
    const maxStarts = args.maxStarts ?? DEFAULT_MAX_STARTS;
    if (!Number.isInteger(maxStarts) || maxStarts < 1)
      throw new Error("cycle_invalid_max");
    this.state = {
      active: true,
      phase: "fighting",
      queue: args.guids.map((guid) => ({ guid, status: "queued" })),
      currentIndex: 0,
      instruction: args.instruction,
      maxStarts,
      startsUsed: 0,
      stopCause: undefined,
      stopDetail: undefined,
      startedAt: this.deps.now(),
      lastLoot: undefined,
      lastRecovery: undefined,
      objective: args.objective?.progress(),
    };
    this.objective = args.objective;
    await this.launch();
  }

  private async launch(): Promise<void> {
    this.run?.abort();
    const run = new AbortController();
    this.run = run;
    this.emit("started");
    try {
      if (this.objective) await this.pursue(this.objective, run.signal);
      else await this.drive(run.signal);
    } catch (error) {
      if (!run.signal.aborted) throw error;
    }
    const { stopCause, stopDetail } = this.state;
    if (this.run === run && stopCause === JEV_UNAVAILABLE)
      throw new JevUnavailableError(String(stopDetail?.["reason"]));
  }

  stop(reason: string, detail?: Record<string, unknown>): void {
    if (!this.state.active) return;
    this.deps.tactics.stop(reason);
    this.run?.abort();
    this.state = {
      ...this.state,
      active: false,
      phase: "stopped",
      stopCause: reason,
      stopDetail: detail,
    };
    this.emit("stopped");
  }

  dispose(): void {
    this.disposed = true;
    this.run?.abort();
    this.events.clear();
  }

  private async drive(signal: AbortSignal): Promise<void> {
    const { queue } = this.state;
    for (;;) {
      const recovered = await this.recoverIfDead(signal);
      if (recovered) return this.stop(recovered.cause, recovered.detail);
      const record = queue[this.state.currentIndex];
      if (record === undefined) return this.stop("queue_exhausted");
      if (this.state.startsUsed >= this.state.maxStarts)
        return this.stop("max_starts_reached");
      const failed = await this.engage(record, signal);
      signal.throwIfAborted();
      if (failed) {
        if (!this.selfDead()) return this.stop(failed.cause, failed.detail);
        record.cause = failed.cause;
      }
      this.state.currentIndex++;
      this.emit("target_done");
    }
  }

  private async pursue(
    objective: CycleObjective,
    signal: AbortSignal,
  ): Promise<void> {
    const tried = new Set(this.state.queue.map((record) => record.guid));
    for (;;) {
      const recovered = await this.recoverIfDead(signal);
      if (recovered) return this.stop(recovered.cause, recovered.detail);
      const pick = this.choose(objective, tried);
      if ("ok" in pick) return this.stop(pick.cause, pick.detail);
      tried.add(pick.guid);
      const record: CycleTargetRecord = { guid: pick.guid, status: "queued" };
      this.state.queue.push(record);
      this.state.currentIndex = this.state.queue.length - 1;
      const failed = await this.engage(record, signal);
      signal.throwIfAborted();
      this.state.objective = objective.progress();
      const far = failed ?? outOfReach(pick, record.cause);
      if (far && !this.selfDead()) return this.stop(far.cause, far.detail);
      if (failed) record.cause = failed.cause;
      this.emit("target_done");
    }
  }

  private choose(
    objective: CycleObjective,
    tried: ReadonlySet<bigint>,
  ): CycleStop | { guid: bigint; distance: number } {
    const pick = objective.pick(tried);
    if ("ok" in pick) return pick;
    if (pick.kind === "complete") {
      this.state.objective = pick.progress;
      return cycleStop("objective_complete");
    }
    if (this.state.startsUsed >= this.state.maxStarts)
      return cycleStop("max_starts_reached");
    return this.deps.gate?.(pick.guid) ?? pick;
  }

  private async recoverIfDead(
    signal: AbortSignal,
  ): Promise<CycleStop | undefined> {
    if (!this.selfDead()) return undefined;
    const recovered = await this.recover(signal);
    signal.throwIfAborted();
    return recovered;
  }

  private async engage(
    record: CycleTargetRecord,
    signal: AbortSignal,
  ): Promise<CycleStop | undefined> {
    const { tactics, entity, control, approach, gate } = this.deps;
    this.state.phase = "fighting";
    const vet = () =>
      vetTarget(entity, control.snapshot().selfGuid, record.guid);
    const refused = vet();
    if (refused) return skip(record, refused, undefined);
    const low = gate?.(record.guid);
    if (low) return low;
    if (approach) {
      const unreached = await approach(record.guid, signal);
      signal.throwIfAborted();
      const cause = vet() ?? unreached;
      if (cause) return skip(record, cause, undefined);
    }
    this.state.startsUsed++;
    const context = {
      targetGuid: record.guid,
      instruction: this.state.instruction,
    };
    try {
      await tactics.start(context, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JevUnavailableError)
        return cycleStop(JEV_UNAVAILABLE, { reason: error.detail });
      const cause = messageOf(error, "fight_failed");
      if (cause === "target_dead") this.state.startsUsed--;
      return skip(record, cause, tactics.snapshot().lastOutcome);
    }
    signal.throwIfAborted();
    const outcome = tactics.snapshot().lastOutcome;
    if (this.selfDead()) return skip(record, "died", outcome);
    if (outcome?.status !== "completed")
      return skip(record, outcome?.reason ?? "fight_failed", outcome);
    record.status = "done";
    record.outcome = outcome;
    return this.loot(record, signal);
  }

  private async recover(signal: AbortSignal): Promise<CycleStop | undefined> {
    this.state.phase = "recovering";
    this.emit("recovery");
    const events = new EventWaiter<RecoveryEvent>();
    const motion = new EventWaiter<ControlEvent>();
    this.recoveryEvents = events;
    this.motionEvents = motion;
    try {
      const { recovery, control } = this.deps;
      const run = { recovery, control, events, motion, signal };
      const result = await recoverCorpse(run);
      if (!result.ok) return result;
      signal.throwIfAborted();
      const { outcome, detail } = result;
      this.state.lastRecovery = { outcome, detail, at: this.deps.now() };
      this.emit("recovered");
      return undefined;
    } finally {
      if (this.recoveryEvents === events) this.recoveryEvents = undefined;
      if (this.motionEvents === motion) this.motionEvents = undefined;
    }
  }

  private async loot(
    target: CycleTargetRecord,
    signal: AbortSignal,
  ): Promise<CycleStop | undefined> {
    this.state.phase = "looting";
    const events = new EventWaiter<RewardsEvent>();
    const bodies = {
      guid: target.guid,
      waiter: new EventWaiter<EntityEvent>(),
    };
    const motion = new EventWaiter<ControlEvent>();
    this.rewardsEvents = events;
    this.bodyEvents = bodies;
    this.motionEvents = motion;
    try {
      const { rewards, bags, control, entity } = this.deps;
      const waiters = { events, bodies: bodies.waiter, motion };
      const run = { rewards, bags, control, entity, ...waiters, signal };
      const result = await lootCorpse(run, target.guid);
      if (!result.ok) return result;
      target.loot = result.record ? "looted" : "none";
      if (result.cause) target.cause = result.cause;
      if (!result.record) return undefined;
      this.state.lastLoot = result.record;
      this.emit("loot_done");
      return undefined;
    } finally {
      if (this.rewardsEvents === events) this.rewardsEvents = undefined;
      if (this.bodyEvents === bodies) this.bodyEvents = undefined;
      if (this.motionEvents === motion) this.motionEvents = undefined;
    }
  }

  private selfDead(): boolean {
    const life = this.deps.recovery.snapshot().life;
    return life === "dead" || life === "ghost";
  }

  private emit(type: CycleEvent["type"]): void {
    this.events.emit({ type, state: this.snapshot(), at: this.deps.now() });
  }
}

function skip(
  record: CycleTargetRecord,
  cause: string,
  outcome: TacticsOutcome | undefined,
): undefined {
  record.status = "skipped";
  record.cause = cause;
  record.outcome = outcome;
}
