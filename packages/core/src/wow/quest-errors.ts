import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
} from "#wow/protocol/inventory";
import type { QuestIntent, QuestWindow } from "#wow/quests-requests";

export type QuestError = {
  kind:
    | "stale_dialog"
    | "invalid"
    | "log_full"
    | "quest_failed"
    | "failed"
    | "timer_failed"
    | "unsupported_window"
    | "inventory";
  at: number;
  questId?: number;
  reason?: number;
  reasonName?: string;
  window?: QuestWindow;
  guid?: bigint;
  name?: string;
};

const takesItems = (pending: QuestIntent | undefined) =>
  pending?.action === "chooseReward" || pending?.action === "accept";

export function inventoryQuestClaim(
  pending: QuestIntent | undefined,
): InventoryClaim | undefined {
  return takesItems(pending) ? { itemGuid: undefined } : undefined;
}

export function inventoryQuestError(
  pending: QuestIntent | undefined,
  packet: InventoryChangeFailure,
): Omit<QuestError, "at"> | undefined {
  if (packet.kind !== "error" || !pending || !takesItems(pending)) return;
  return {
    kind: "inventory",
    questId: pending.questId,
    reason: packet.result,
    name: inventoryResultName(packet.result),
  };
}
