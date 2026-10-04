import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";

const UNREACHABLE = "target_unreachable";

export type BesetRecord = {
  cause?: string;
  guid: bigint;
  outcome?: { reason?: string };
  status: string;
};

export function besetStop(
  queue: readonly BesetRecord[],
  attackers: readonly bigint[] | undefined,
): CycleStop | undefined {
  const victim = queue.find(
    (entry) =>
      entry.status === "skipped" &&
      (entry.cause === UNREACHABLE || entry.outcome?.reason === UNREACHABLE) &&
      attackers?.includes(entry.guid),
  );
  return victim === undefined
    ? undefined
    : cycleStop("attacker_unreachable", { ref: victim.guid });
}
