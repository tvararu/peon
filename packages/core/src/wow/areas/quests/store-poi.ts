import type { QuestPoi, QuestPoiReply } from "#wow/areas/quests/protocol";

export type PoiStatus = "pending" | "known" | "none" | "no_reply";
export type PoiEntry = { status: PoiStatus; pois: QuestPoi[]; at: number };
export type Pois = ReadonlyMap<number, PoiEntry>;
export type PoisChange = { pois: Pois; settled: number[] };

export function requestPois(
  pois: Pois,
  ids: readonly number[],
  at: number,
): Pois {
  const next = new Map(pois);
  for (const id of ids) next.set(id, { status: "pending", pois: [], at });
  return next;
}

export function receivePoiResponse(
  pois: Pois,
  replies: readonly QuestPoiReply[],
  at: number,
): PoisChange {
  const next = new Map(pois);
  const settled: number[] = [];
  for (const { questId, pois: list } of replies) {
    next.set(
      questId,
      list.length === 0
        ? { status: "none", pois: [], at }
        : { status: "known", pois: list, at },
    );
    settled.push(questId);
  }
  return { pois: next, settled };
}

export function expirePois(
  pois: Pois,
  pending: readonly number[],
  at: number,
): PoisChange {
  const next = new Map(pois);
  const settled: number[] = [];
  for (const id of pending)
    if (next.get(id)?.status === "pending") {
      next.set(id, { status: "no_reply", pois: [], at });
      settled.push(id);
    }
  return { pois: next, settled };
}
