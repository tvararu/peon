export type Completed = { ids: ReadonlySet<number>; at: number };

export function receiveCompleted(
  ids: ReadonlySet<number>,
  at: number,
): Completed {
  return { ids: new Set(ids), at };
}

export function addCompleted(
  completed: Completed | undefined,
  questId: number,
  at: number,
): Completed | undefined {
  if (!completed || completed.ids.has(questId)) return completed;
  return { ids: new Set([...completed.ids, questId]), at };
}
