import {
  type ControlEvent,
  type EntityEvent,
  type RecoveryEvent,
  type RewardsEvent,
  snapshotEntityEvent,
  type Unsubscribe,
} from "@peon/core";
import { type CycleRecovery, recoverCorpse } from "#harness/loops/corpse-run";
import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";
import type { CycleDeps, CycleLootRecord } from "#harness/loops/cycle-types";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootCorpse } from "#harness/loops/loot-run";

export type LootOutcome =
  | { ok: true; record: CycleLootRecord | undefined; cause?: string }
  | CycleStop;
export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

export type RunDeps = Pick<
  CycleDeps,
  "rewards" | "bags" | "recovery" | "control" | "entity" | "observed"
> & {
  events: RunEvents;
  cycleActive: () => boolean;
};

type Subscribe<E> = (cb: (event: E) => void) => Unsubscribe;
export type RunEvents = {
  rewards: Subscribe<RewardsEvent>;
  entity: Subscribe<EntityEvent>;
  recovery: Subscribe<RecoveryEvent>;
  control: Subscribe<ControlEvent>;
};
export type Runs = {
  lootCorpse: (guid: bigint, signal: AbortSignal) => Promise<LootOutcome>;
  recoverCorpse: (signal: AbortSignal) => Promise<RecoveryOutcome>;
};
type LootCall = { deps: RunDeps; guid: bigint; signal: AbortSignal };
type RecoveryCall = { deps: RunDeps; signal: AbortSignal };

export function createRuns(deps: RunDeps): Runs {
  let running = false;
  async function exclusive<T>(signal: AbortSignal, work: () => Promise<T>) {
    if (running || deps.cycleActive()) return cycleStop("busy");
    if (signal.aborted) return cycleStop("cancelled");
    running = true;
    try {
      return await work();
    } catch (error) {
      if (signal.aborted) return cycleStop("cancelled");
      throw error;
    } finally {
      running = false;
    }
  }
  return {
    lootCorpse(guid, signal) {
      return exclusive(signal, () => lootRun({ deps, guid, signal }));
    },
    recoverCorpse(signal) {
      return exclusive(signal, () => recoveryRun({ deps, signal }));
    },
  };
}

async function lootRun({ deps, guid, signal }: LootCall): Promise<LootOutcome> {
  const events = new EventWaiter<RewardsEvent>();
  const bodies = new EventWaiter<EntityEvent>();
  const motion = new EventWaiter<ControlEvent>();
  const detach = [
    deps.events.rewards((event) => events.push(event)),
    deps.events.entity((event) => {
      if (entityGuid(event) === guid) bodies.push(snapshotEntityEvent(event));
    }),
    deps.events.control((event) => motion.push(event)),
  ];
  try {
    const { rewards, bags, control, entity, observed } = deps;
    const waiters = { events, bodies, motion };
    const run = {
      rewards,
      bags,
      control,
      entity,
      observed,
      ...waiters,
      signal,
    };
    return await lootCorpse(run, guid);
  } finally {
    for (const off of detach) off();
  }
}

async function recoveryRun({
  deps,
  signal,
}: RecoveryCall): Promise<RecoveryOutcome> {
  const events = new EventWaiter<RecoveryEvent>();
  const motion = new EventWaiter<ControlEvent>();
  const detach = [
    deps.events.recovery((event) => events.push(event)),
    deps.events.control((event) => motion.push(event)),
  ];
  try {
    const { recovery, control } = deps;
    return await recoverCorpse({ recovery, control, events, motion, signal });
  } finally {
    for (const off of detach) off();
  }
}

function entityGuid(event: EntityEvent): bigint {
  return event.type === "disappear" ? event.guid : event.entity.guid;
}
