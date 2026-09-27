import type { QuestQueryResponse } from "#wow/protocol/quest-query";
import type { QuestLog } from "#wow/quest-slots";

export type QuestQuery =
  | { questId: number; status: "unanswered"; sentAt: number }
  | {
      questId: number;
      status: "known";
      receivedAt: number;
      data: QuestQueryResponse;
    };

export class QuestQueries {
  readonly entries = new Map<number, QuestQuery>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  record(questId: number): void {
    if (this.entries.get(questId)?.status !== "known")
      this.entries.set(questId, {
        questId,
        status: "unanswered",
        sentAt: this.now(),
      });
  }

  missing(log: QuestLog): number[] {
    const ids = new Set<number>();
    for (const { questId } of log.slots)
      if (questId && !this.entries.has(questId)) ids.add(questId);
    return [...ids];
  }

  receive(data: QuestQueryResponse): void {
    this.entries.set(data.questId, {
      questId: data.questId,
      status: "known",
      receivedAt: this.now(),
      data,
    });
  }
}
