import type { WorldHandle } from "#wow/client";
import type { CycleRecovery } from "#wow/corpse-run";
import { type CycleStop, cycleStop } from "#wow/cycle-stop";
import type { CycleDeps, CycleLootRecord } from "#wow/encounter-cycle";
import type { EntityEvent } from "#wow/entity-store";
import { EventWaiter } from "#wow/event-waiter";
import { lootCorpse } from "#wow/loot-run";
import type { RewardsEvent } from "#wow/rewards";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import type { WorldEvents } from "#wow/world-events";

export type LootOutcome =
  | { ok: true; record: CycleLootRecord | undefined }
  | CycleStop;
export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

export type RunDeps = Pick<
  CycleDeps,
  "rewards" | "bags" | "recovery" | "control"
> & {
  events: Pick<WorldEvents, "rewards" | "entity" | "recovery" | "control">;
  cycleActive: () => boolean;
};

type Runs = Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;
type LootCall = { deps: RunDeps; guid: bigint; signal: AbortSignal };

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
    recoverCorpse() {
      return Promise.reject(new Error("not_implemented"));
    },
  };
}

async function lootRun({ deps, guid, signal }: LootCall): Promise<LootOutcome> {
  const events = new EventWaiter<RewardsEvent>();
  const bodies = new EventWaiter<EntityEvent>();
  const detach = [
    deps.events.rewards.subscribe((event) => events.push(event)),
    deps.events.entity.subscribe((event) => {
      if (entityGuid(event) === guid) bodies.push(event);
    }),
  ];
  try {
    const { rewards, bags } = deps;
    return await lootCorpse({ rewards, bags, events, bodies, signal }, guid);
  } finally {
    for (const off of detach) off();
  }
}

function entityGuid(event: EntityEvent): bigint {
  return event.type === "disappear" ? event.guid : event.entity.guid;
}

function bagsOf({ quests, items }: Runtimes): CycleDeps["bags"] {
  return {
    questItems: () =>
      new Set(quests.snapshot().items.map((item) => item.itemId)),
    stackSize: (entry) =>
      items.lookup(entry).then(
        (template) => template?.stackSize,
        () => undefined,
      ),
  };
}

export function runMethods(conn: WorldConn, rt: Runtimes): Runs {
  const { control, cycle, recovery, rewards } = rt;
  const cycleActive = () => cycle.snapshot().active;
  const bags = bagsOf(rt);
  const { events } = conn;
  return createRuns({ bags, control, cycleActive, events, recovery, rewards });
}
