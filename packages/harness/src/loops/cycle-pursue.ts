import { settleObject } from "#harness/loops/cycle-object-settle";
import type {
  CycleObjective,
  CycleTargetRecord,
} from "#harness/loops/encounter-cycle";
import type { CycleStop } from "#harness/loops/cycle-stop";
import { type ObjectivePick, outOfReach } from "#harness/loops/quest-objective";

export type PursueLoop = {
  attackers?: () => readonly bigint[];
  selfDead: () => boolean;
  stop: (cause: string, detail?: Record<string, unknown>) => void;
  choose: (
    objective: CycleObjective,
    tried: ReadonlySet<bigint>,
  ) => CycleStop | Extract<ObjectivePick, { kind: "target" | "object" }>;
  attempt: (
    objective: CycleObjective,
    pick: Extract<ObjectivePick, { kind: "target" | "object" }>,
    signal: AbortSignal,
  ) => Promise<{
    record: CycleTargetRecord;
    failed: CycleStop | undefined;
    advanced: boolean;
  }>;
  engage: (
    record: CycleTargetRecord,
    signal: AbortSignal,
  ) => Promise<CycleStop | undefined>;
  observeObjective: () => void;
  queue: (guid: bigint) => CycleTargetRecord;
  recoverIfDead: (signal: AbortSignal) => Promise<CycleStop | undefined>;
  targetDone: () => void;
};

type PursueState = {
  tried: Set<bigint>;
  failures: Map<bigint, number>;
  fought: Set<bigint>;
  looted: boolean;
};

async function defend(
  loop: PursueLoop,
  state: PursueState,
  run: { guid: bigint; signal: AbortSignal },
): Promise<void> {
  const { guid, signal } = run;
  state.fought.add(guid);
  const record = loop.queue(guid);
  const failed = await loop.engage(record, signal);
  signal.throwIfAborted();
  loop.observeObjective();
  if (failed) record.cause = failed.cause;
  loop.targetDone();
}

async function settleStop(
  loop: PursueLoop,
  state: PursueState,
  run: { stop: CycleStop; objective: CycleObjective; signal: AbortSignal },
): Promise<boolean> {
  const { stop, objective, signal } = run;
  if (
    stop.cause === "objective_targets_absent" &&
    state.looted &&
    (await objective.awaitComplete?.({ signal }))
  )
    return false;
  loop.stop(stop.cause, stop.detail);
  return true;
}

async function settlePick(
  loop: PursueLoop,
  state: PursueState,
  run: {
    objective: CycleObjective;
    pick: Extract<ObjectivePick, { kind: "target" | "object" }>;
    signal: AbortSignal;
  },
): Promise<boolean> {
  const { objective, pick, signal } = run;
  if (pick.kind === "target") state.tried.add(pick.guid);
  const { record, failed, advanced } = await loop.attempt(
    objective,
    pick,
    signal,
  );
  state.looted = state.looted || record.loot === "looted";
  if (pick.kind === "object")
    settleObject(state.failures, state.tried, pick.guid, {
      advanced,
      spent: record.loot === "looted",
    });
  const far = failed ?? outOfReach(pick, record.cause);
  if (far && !loop.selfDead()) {
    loop.stop(far.cause, far.detail);
    return true;
  }
  if (failed) record.cause = failed.cause;
  loop.targetDone();
  return false;
}

export async function pursueObjective(
  loop: PursueLoop,
  initialQueue: readonly bigint[],
  objective: CycleObjective,
  signal: AbortSignal,
): Promise<void> {
  const state: PursueState = {
    failures: new Map(),
    fought: new Set(),
    looted: false,
    tried: new Set(initialQueue),
  };
  for (;;) {
    const recovered = await loop.recoverIfDead(signal);
    if (recovered) {
      loop.stop(recovered.cause, recovered.detail);
      return;
    }
    const defender = (objective.attackers ?? loop.attackers)?.().find(
      (guid) => !(state.fought.has(guid) || loop.selfDead()),
    );
    if (defender !== undefined) {
      await defend(loop, state, { guid: defender, signal });
      continue;
    }
    const pick = loop.choose(objective, state.tried);
    if ("ok" in pick) {
      if (await settleStop(loop, state, { objective, signal, stop: pick }))
        return;
      continue;
    }
    if (await settlePick(loop, state, { objective, pick, signal })) return;
  }
}
