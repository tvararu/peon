import type { MoveKind } from "#wow/areas/items/moves";
import type {
  RefundInfoPacket,
  RefundResultPacket,
} from "#wow/areas/items/protocol-refund";
import type {
  SetDeletedEvent,
  SetSavedEvent,
  SetSaveRequestedEvent,
  SetsListedEvent,
  SetUsedEvent,
  SetUseRequestedEvent,
} from "#wow/areas/items/protocol-sets";
import type { ItemText } from "#wow/areas/items/reads";
import type { ProficiencyKind } from "#wow/areas/items/timers";

export type ReadHead = { itemGuid: bigint; entry: number | undefined };
export type MoveHead = {
  kind: MoveKind;
  itemGuid: bigint;
  entry: number | undefined;
};
export type ItemReceived = {
  entry: number;
  guid: bigint | undefined;
  itemLevel: number;
  inventoryType: number;
  wornItemLevel: number | undefined;
};
type SocketHead = { itemGuid: bigint; entry: number | undefined };
type RefundHead = { itemGuid: bigint; entry: number | undefined };

export type ItemsEvent =
  | ({ type: "move_requested" } & MoveHead)
  | ({ type: "moved" } & MoveHead)
  | ({ type: "move_refused"; reason: string; result: number } & MoveHead)
  | ({ type: "move_no_change" } & MoveHead)
  | ({ type: "move_unanswered" } & MoveHead)
  | ({ type: "item_received" } & ItemReceived)
  | ({ type: "read_requested" } & ReadHead)
  | ({ type: "read_ok" } & ReadHead)
  | ({
      type: "read_failed";
      reason: string;
      result: number | undefined;
    } & ReadHead)
  | ({ type: "read_unanswered" } & ReadHead)
  | ({ type: "item_text" } & ItemText)
  | {
      type: "item_cooldown";
      itemGuid: bigint;
      entry: number | undefined;
      spell: number;
    }
  | {
      type: "item_timer";
      itemGuid: bigint;
      entry: number | undefined;
      seconds: number;
      expiresAt: number;
    }
  | {
      type: "item_enchant_timer";
      itemGuid: bigint;
      entry: number | undefined;
      slot: number;
      seconds: number;
      expiresAt: number;
    }
  | { type: "durability_loss_death" }
  | {
      type: "proficiency_changed";
      kind: ProficiencyKind;
      mask: number;
      added: number;
      names: string[];
    }
  | {
      type: "enchantment_log";
      target: bigint;
      caster: bigint;
      entry: number;
      enchantId: number;
      own: boolean;
    }
  | {
      type: "sockets_updated";
      itemGuid: bigint;
      entry: number | undefined;
      sockets: [number, number, number];
      bonus: number;
    }
  | ({ type: "socket_refused"; reason: string } & SocketHead)
  | ({ type: "socket_unanswered" } & SocketHead)
  | ({ type: "refund_info"; offer: RefundInfoPacket } & RefundHead)
  | ({ type: "refund_info_none" } & RefundHead)
  | ({ type: "refund_result"; result: RefundResultPacket } & RefundHead)
  | ({ type: "refund_unanswered" } & RefundHead)
  | SetsListedEvent
  | SetSaveRequestedEvent
  | SetSavedEvent
  | SetUseRequestedEvent
  | SetUsedEvent
  | SetDeletedEvent;
