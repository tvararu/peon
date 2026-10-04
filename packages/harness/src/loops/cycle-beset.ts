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

export function attackerFirst<T extends BesetRecord>(
  queue: T[],
  index: number,
  attackers: readonly bigint[] | undefined,
  make: (guid: bigint) => T,
): void {
  const current = queue[index]?.guid;
  const guid = attackers?.find(
    (candidate) =>
      candidate !== current &&
      !queue.some(
        (entry) => entry.guid === candidate && entry.status !== "queued",
      ),
  );
  if (guid === undefined) return;
  const later = queue.findIndex(
    (entry, at) => at > index && entry.guid === guid,
  );
  const moved = later < 0 ? undefined : queue.splice(later, 1)[0];
  queue.splice(index, 0, moved ?? make(guid));
}
