import {
  type ControlEvent,
  type EntityEvent,
  type RecoveryEvent,
  type RewardsEvent,
  snapshotEntityEvent,
} from "@peon/core";
import { Emitter, type Unsubscribe } from "@peon/core/lib/emitter";
import { messageOf } from "@peon/core/lib/errors";
import { JEV_UNAVAILABLE, JevUnavailableError } from "#harness/jev/failure";
import { recoverCorpse } from "#harness/loops/corpse-run";
import { besetStop } from "#harness/loops/cycle-beset";
import { holdApproach, skip } from "#harness/loops/cycle-hold";
import { pursueObjective } from "#harness/loops/cycle-pursue";
import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";
import type { CycleDeps, CycleEvent, CycleObjective, CycleState, CycleTargetRecord } from "#harness/loops/cycle-types";

export type {
  CycleDeps,
  CycleEvent,
  CycleLootRecord,
  CycleObjective,
  CyclePhase,
  CycleState,
  CycleTargetRecord,
  CycleVisit,
  CycleVisitEnd,
} from "#harness/loops/cycle-types";

import { vetTarget } from "#harness/loops/cycle-vet";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootCorpse } from "#harness/loops/loot-run";
import type {
  ObjectivePick,
  ObjectiveProgress,
} from "#harness/loops/quest-objective";

const DEFAULT_MAX_STARTS = 10;

const progressKey = (progress: ObjectiveProgress | undefined) =>
  JSON.stringify(progress ?? null);
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
    for (;;) {
      const recovered = await this.recoverIfDead(signal);
      if (recovered) return this.stop(recovered.cause, recovered.detail);
      const record = this.state.queue[this.state.currentIndex];
      if (record === undefined) {
        const beset = besetStop(this.state.queue, this.deps.attackers?.());
        return this.stop(beset?.cause ?? "queue_exhausted", beset?.detail);
      }
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
    await pursueObjective(
      {
        attackers: this.deps.attackers,
        outOfStarts: () => this.state.startsUsed >= this.state.maxStarts,
        attempt: (target, pick, runSignal) =>
          this.attempt(target, pick, runSignal),
        choose: (target, tried) => this.choose(target, tried),
        engage: (record, runSignal) => this.engage(record, runSignal),
        observeObjective: () => {
          this.state.objective = this.objective?.progress();
        },
        queue: (guid) => {
          const record: CycleTargetRecord = { guid, status: "queued" };
          this.state.queue.push(record);
          this.state.currentIndex = this.state.queue.length - 1;
          return record;
        },
        recoverIfDead: (runSignal) => this.recoverIfDead(runSignal),
        selfDead: () => this.selfDead(),
        stop: (cause, detail) => this.stop(cause, detail),
        targetDone: () => this.emit("target_done"),
      },
      this.state.queue.map((record) => record.guid),
      objective,
      signal,
    );
  }

  private async attempt(
    objective: CycleObjective,
    pick: Extract<ObjectivePick, { kind: "target" | "object" }>,
    signal: AbortSignal,
  ): Promise<{
    record: CycleTargetRecord;
    failed: CycleStop | undefined;
    advanced: boolean;
  }> {
    const before =
      pick.kind === "object" ? progressKey(objective.progress()) : "";
    const record: CycleTargetRecord = { guid: pick.guid, status: "queued" };
    this.state.queue.push(record);
    this.state.currentIndex = this.state.queue.length - 1;
    const failed =
      pick.kind === "object"
        ? await this.visit(objective, record, pick, signal)
        : await this.engage(record, signal);
    signal.throwIfAborted();
    this.state.objective = objective.progress();
    const advanced = progressKey(this.state.objective) !== before;
    return { advanced, failed, record };
  }

  private choose(
    objective: CycleObjective,
    tried: ReadonlySet<bigint>,
  ): CycleStop | Extract<ObjectivePick, { kind: "target" | "object" }> {
    const pick = objective.pick(tried);
    if ("ok" in pick) return pick;
    if (pick.kind === "complete") {
      this.state.objective = pick.progress;
      return cycleStop("objective_complete");
    }
    if (this.state.startsUsed >= this.state.maxStarts)
      return cycleStop("max_starts_reached");
    if (pick.kind === "object") return pick;
    return this.deps.gate?.(pick.guid) ?? pick;
  }

  private async visit(
    objective: CycleObjective,
    record: CycleTargetRecord,
    pick: Extract<ObjectivePick, { kind: "object" }>,
    signal: AbortSignal,
  ): Promise<CycleStop | undefined> {
    if (!objective.visit)
      return cycleStop("objective_object_unsupported", { entry: pick.entry });
    this.state.phase = "looting";
    this.state.startsUsed++;
    const events = new EventWaiter<RewardsEvent>();
    this.rewardsEvents = events;
    try {
      const { approach, bags, rewards } = this.deps;
      const end = await objective.visit(pick, {
        approach,
        bags,
        events,
        rewards,
        signal,
      });
      signal.throwIfAborted();
      if (!end.ok) return end;
      if (end.cause !== undefined) return skip(record, end.cause, undefined);
      record.status = "done";
      if (!end.record) return undefined;
      record.loot = "looted";
      this.state.lastLoot = end.record;
      this.emit("loot_done");
      return undefined;
    } finally {
      if (this.rewardsEvents === events) this.rewardsEvents = undefined;
    }
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
    const beset = besetStop(this.state.queue, this.deps.attackers?.());
    if (beset) {
      signal.throwIfAborted();
      return beset;
    }
    this.state.phase = "fighting";
    const { tactics, entity, control, gate } = this.deps;
    const vet = () =>
      vetTarget(entity, control.snapshot().selfGuid, record.guid);
    const refused = vet();
    if (refused) return skip(record, refused, undefined);
    const low = gate?.(record.guid);
    if (low) return low;
    const { approach, attackers } = this.deps;
    const hold = {
      approach,
      attackers,
      queue: this.state.queue,
      vet,
      signal,
    };
    const held = await holdApproach(hold, record);
    if (held === "skip") return undefined;
    if (held) return held;
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
      const { rewards, bags, control, entity, observed } = this.deps;
      const waiters = { events, bodies: bodies.waiter, motion };
      const run = {
        rewards,
        bags,
        control,
        entity,
        observed,
        ...waiters,
        signal,
      };
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
