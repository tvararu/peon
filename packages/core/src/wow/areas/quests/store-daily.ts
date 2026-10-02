export const DAILY_FIRST = 1280;
export const DAILY_COUNT = 25;

export function receiveDaily(
  fields: ReadonlyMap<number, number>,
): ReadonlySet<number> {
  const next = new Set<number>();
  for (let offset = DAILY_FIRST; offset < DAILY_FIRST + DAILY_COUNT; offset++) {
    const id = fields.get(offset) ?? 0;
    if (id > 0) next.add(id);
  }
  return next;
}

export function sameDaily(
  before: ReadonlySet<number> | undefined,
  after: ReadonlySet<number>,
): boolean {
  if (before === undefined) return after.size === 0;
  if (before.size !== after.size) return false;
  for (const id of after) if (!before.has(id)) return false;
  return true;
}
