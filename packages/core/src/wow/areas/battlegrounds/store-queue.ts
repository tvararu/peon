import {
  type BattlefieldList,
  type BattlefieldStatus,
  groupJoinedName,
} from "#wow/areas/battlegrounds/protocol-queue";

export const QUEUE_SLOTS = 2;

type Unslotted<T> = T extends unknown ? Omit<T, "slot"> : never;

export type BattlegroundsSlot =
  | { kind: "none" }
  | (Unslotted<Extract<BattlefieldStatus, { kind: "queued" }>> & {
      receivedAt: number;
    })
  | (Unslotted<Extract<BattlefieldStatus, { kind: "invited" }>> & {
      receivedAt: number;
      expiresAt: number;
    })
  | (Unslotted<Extract<BattlefieldStatus, { kind: "active" }>> & {
      receivedAt: number;
    })
  | (Unslotted<Extract<BattlefieldStatus, { kind: "leaving" }>> & {
      receivedAt: number;
    });

export type BattlegroundsLastJoin = {
  result: number;
  error: string | undefined;
  guid: bigint | undefined;
};

export type BattlegroundsQueue = {
  slots: readonly BattlegroundsSlot[];
  list: BattlefieldList | undefined;
  lastJoin: BattlegroundsLastJoin | undefined;
};

export type BattlegroundsStatusEvent = {
  type: "bg_status";
  slot: number;
  status: BattlegroundsSlot;
  previous: BattlegroundsSlot["kind"];
};

export type BattlegroundsInvitedEvent = {
  type: "bg_invited";
  slot: number;
  bgType: number;
  mapId: number;
  expiresAt: number;
};

export type BattlegroundsLeftEvent = {
  type: "bg_left";
  slot: number;
  bgType: number | undefined;
  previous: BattlegroundsSlot["kind"];
};

export type BattlegroundsListEvent = BattlefieldList & { type: "bg_list" };

export type BattlegroundsJoinResultEvent = BattlegroundsLastJoin & {
  type: "bg_join_result";
};

export type BattlegroundsQueueEvent =
  | BattlegroundsStatusEvent
  | BattlegroundsInvitedEvent
  | BattlegroundsLeftEvent
  | BattlegroundsListEvent
  | BattlegroundsJoinResultEvent;

const NONE: BattlegroundsSlot = { kind: "none" };

function slotOf(status: BattlefieldStatus, now: number): BattlegroundsSlot {
  const { slot: _slot, ...rest } = status;
  if (rest.kind === "none") return NONE;
  if (rest.kind === "invited")
    return { ...rest, expiresAt: now + rest.timeToRemoveMs, receivedAt: now };
  return { ...rest, receivedAt: now };
}

function bgTypeOf(slot: BattlegroundsSlot): number | undefined {
  return slot.kind === "none" ? undefined : slot.bgType;
}

export class BattlegroundsQueueTracker {
  private slots: BattlegroundsSlot[] = [NONE, NONE];
  private list: BattlefieldList | undefined;
  private lastJoin: BattlegroundsLastJoin | undefined;

  private readonly now: () => number;
  private readonly emit: (event: BattlegroundsQueueEvent) => void;

  constructor(
    now: () => number,
    emit: (event: BattlegroundsQueueEvent) => void,
  ) {
    this.now = now;
    this.emit = emit;
  }

  snapshot(): BattlegroundsQueue {
    return {
      lastJoin: this.lastJoin ? { ...this.lastJoin } : undefined,
      list: this.list
        ? { ...this.list, instances: [...this.list.instances] }
        : undefined,
      slots: [...this.slots],
    };
  }

  slot(index: number): BattlegroundsSlot {
    return this.slots[index] ?? NONE;
  }

  receiveStatus(status: BattlefieldStatus): void {
    const { slot } = status;
    const previous = this.slot(slot);
    const next = slotOf(status, this.now());
    const slots = [...this.slots];
    while (slots.length <= slot) slots.push(NONE);
    slots[slot] = next;
    this.slots = slots;
    this.emit({
      previous: previous.kind,
      slot,
      status: next,
      type: "bg_status",
    });
    if (next.kind === "invited")
      this.emit({
        bgType: next.bgType,
        expiresAt: next.expiresAt,
        mapId: next.mapId,
        slot,
        type: "bg_invited",
      });
    if (next.kind === "none" && previous.kind !== "none")
      this.emit({
        bgType: bgTypeOf(previous),
        previous: previous.kind,
        slot,
        type: "bg_left",
      });
  }

  receiveList(list: BattlefieldList): void {
    this.list = list;
    this.emit({ ...list, type: "bg_list" });
  }

  receiveJoinResult(result: number, guid: bigint | undefined): void {
    const joined = { error: groupJoinedName(result), guid, result };
    this.lastJoin = joined;
    this.emit({ ...joined, type: "bg_join_result" });
  }

  dispose(): void {
    this.slots = [NONE, NONE];
    this.list = undefined;
    this.lastJoin = undefined;
  }
}
