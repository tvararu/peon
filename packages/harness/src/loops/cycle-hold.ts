import type { CycleApproach } from "#harness/loops/cycle-approach";
import {
  besetStop,
  pendingAttacker,
  stuckAttacker,
} from "#harness/loops/cycle-beset";
import type { CycleStop } from "#harness/loops/cycle-stop";
import type { CycleTargetRecord } from "#harness/loops/cycle-types";
import type { TacticsOutcome } from "#harness/loops/tactics";

export function skip(
  record: CycleTargetRecord,
  cause: string,
  outcome: TacticsOutcome | undefined,
): undefined {
  record.status = "skipped";
  record.cause = cause;
  record.outcome = outcome;
}

export type HoldRun = {
  approach: CycleApproach | undefined;
  attackers: (() => readonly bigint[]) | undefined;
  defer: boolean;
  queue: readonly CycleTargetRecord[];
  vet: () => string | undefined;
  signal: AbortSignal;
};

export async function holdApproach(
  run: HoldRun,
  record: CycleTargetRecord,
): Promise<"skip" | "defer" | CycleStop | undefined> {
  const { approach, attackers, defer, queue, vet, signal } = run;
  if (!approach) return undefined;
  const unreached = await approach(record.guid, signal);
  signal.throwIfAborted();
  const cause = vet() ?? unreached;
  if (cause) {
    skip(record, cause, undefined);
    return "skip";
  }
  const beset = besetStop(queue, attackers?.());
  if (beset) return beset;
  const others = attackers?.().filter((guid) => guid !== record.guid);
  const stuck = stuckAttacker(
    queue.filter((entry) => entry !== record),
    others,
  );
  if (stuck) return stuck;
  const joined = pendingAttacker(queue, record.guid, attackers?.());
  return defer && joined !== undefined ? "defer" : undefined;
}
