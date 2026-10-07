import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";

const UNREACHABLE = "target_unreachable";
const MAX_TRIES = 2;

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
      unreachable(entry) &&
      attackers?.includes(entry.guid),
  );
  return victim === undefined
    ? undefined
    : cycleStop("attacker_unreachable", { ref: victim.guid });
}

export function stuckAttacker(
  queue: readonly BesetRecord[],
  attackers: readonly bigint[] | undefined,
): CycleStop | undefined {
  const guid = attackers?.find((candidate) => {
    const tries = queue.filter(
      (entry) => entry.guid === candidate && entry.status !== "queued",
    );
    return (
      tries.length >= MAX_TRIES &&
      !tries.some((entry) => entry.status === "done")
    );
  });
  return guid === undefined
    ? undefined
    : cycleStop("attacker_unreachable", { ref: guid });
}

function unreachable(entry: BesetRecord): boolean {
  return entry.cause === UNREACHABLE || entry.outcome?.reason === UNREACHABLE;
}

function spent(queue: readonly BesetRecord[], guid: bigint): boolean {
  const tries = queue.filter(
    (entry) => entry.guid === guid && entry.status !== "queued",
  );
  return (
    tries.length >= MAX_TRIES ||
    tries.some((entry) => entry.status === "done" || unreachable(entry))
  );
}

export function attackerFirst<T extends BesetRecord>(
  queue: T[],
  index: number,
  attackers: readonly bigint[] | undefined,
  make: (guid: bigint) => T,
): void {
  const current = queue[index]?.guid;
  const guid = attackers?.find(
    (candidate) => candidate !== current && !spent(queue, candidate),
  );
  if (guid === undefined) return;
  const later = queue.findIndex(
    (entry, at) => at > index && entry.guid === guid,
  );
  const moved = later < 0 ? undefined : queue.splice(later, 1)[0];
  queue.splice(index, 0, moved ?? make(guid));
}
