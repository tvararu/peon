const MAX_OBJECT_FAILURES = 2;

export function settleObject(
  failures: Map<bigint, number>,
  tried: Set<bigint>,
  guid: bigint,
  result: { advanced: boolean; spent: boolean },
): void {
  if (result.spent) {
    tried.add(guid);
    return;
  }
  if (result.advanced) {
    failures.delete(guid);
    return;
  }
  const count = (failures.get(guid) ?? 0) + 1;
  failures.set(guid, count);
  if (count >= MAX_OBJECT_FAILURES) tried.add(guid);
}
