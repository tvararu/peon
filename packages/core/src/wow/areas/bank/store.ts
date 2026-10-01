import { Emitter, type Unsubscribe } from "#lib/emitter";
import { distance } from "#wow/geometry";
import type { InventorySlot, InventoryState } from "#wow/inventory";
import { readInventory } from "#wow/inventory";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
  isNoChange,
  ownsInventoryFailure,
} from "#wow/protocol/inventory";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const BANKER_NPC_FLAG = 0x2_00_00;
export const BANKER_YARDS = 5.5;

export type BankMoveRequest =
  | { kind: "open"; npc: bigint; requestedAt: number }
  | {
      kind: "deposit";
      bag: number;
      slot: number;
      guid: bigint | undefined;
      entry?: number | undefined;
      toCounts?: number[] | undefined;
      requestedAt: number;
    }
  | {
      kind: "withdraw";
      bag: number;
      slot: number;
      guid: bigint | undefined;
      entry?: number | undefined;
      toCounts?: number[] | undefined;
      requestedAt: number;
    }
  | { kind: "slot"; banker: bigint; requestedAt: number };

export type BankResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "no_change" }
  | { status: "unanswered" };

export type BankOutcome = BankResult & {
  request: BankMoveRequest;
  observedAt: number;
};

export type BankState = {
  banker: bigint | undefined;
  bagSlots: number | undefined;
  pending: BankMoveRequest | undefined;
  lastSlotResult: string | undefined;
  lastOutcome: BankOutcome | undefined;
};

export type BankEvent =
  | { type: "opened"; banker: bigint }
  | { type: "moved"; kind: "deposit" | "withdraw"; guid: bigint }
  | { type: "slot_bought"; result: string }
  | { type: "refused"; kind: BankMoveRequest["kind"]; reason: string }
  | { type: "no_change"; kind: BankMoveRequest["kind"] }
  | { type: "unanswered"; kind: BankMoveRequest["kind"] };

type MoveRequest = Extract<
  BankMoveRequest,
  { kind: "deposit" } | { kind: "withdraw" }
>;

function readBagSlots(deps: SessionDeps): number | undefined {
  const value = deps
    .getEntity(deps.selfGuid())
    ?.rawFields.get(PLAYER_FIELDS.BYTES_2.offset);
  if (value === undefined) return undefined;
  return (value >>> 16) & 0xff;
}

const UNCLAIMED: InventoryClaim = { itemGuid: undefined };

function legacyClaims(core: CoreStores): (InventoryClaim | undefined)[] {
  const destroy = core.destroy.pending;
  const buy = core.vendor.pending?.action === "buy";
  const quest = core.quests.pending?.action;
  const take = core.rewards.pending?.action === "take";
  return [
    destroy && { itemGuid: destroy.itemGuid },
    buy ? UNCLAIMED : undefined,
    quest === "accept" || quest === "chooseReward" ? UNCLAIMED : undefined,
    take ? UNCLAIMED : undefined,
  ];
}

function bankSlots(inventory: InventoryState): InventorySlot[] {
  return [...inventory.slots, ...(inventory.bank?.slots ?? [])];
}

function inBank(region: string): boolean {
  return (
    region === "bank" ||
    region === "bankbag" ||
    region === "bank_bag_item" ||
    region === "equipment"
  );
}

function isCarried(region: string): boolean {
  return (
    region === "backpack" ||
    region === "bag_item" ||
    region === "bag" ||
    region === "equipment" ||
    region === "keyring" ||
    region === "currency"
  );
}

function histogram(
  counts: readonly (number | undefined)[],
): Map<number, number> {
  const result = new Map<number, number>();
  for (const count of counts) {
    if (count === undefined) continue;
    result.set(count, (result.get(count) ?? 0) + 1);
  }
  return result;
}

function merged(
  request: MoveRequest,
  targets: InventorySlot[],
): bigint | undefined {
  const counts = histogram(
    targets.map((slot) =>
      slot.status === "occupied" ? slot.item.count : undefined,
    ),
  );
  const before = histogram(request.toCounts ?? []);
  let added = 0;
  for (const [count, total] of counts)
    if (total > (before.get(count) ?? 0))
      added += total - (before.get(count) ?? 0);
  let missing = 0;
  for (const [count, had] of before)
    if (had > (counts.get(count) ?? 0))
      missing += had - (counts.get(count) ?? 0);
  if (added === 0 || missing > added) return undefined;
  const grown = targets.find(
    (slot) =>
      slot.status === "occupied" &&
      slot.item.count !== undefined &&
      slot.guid !== request.guid &&
      (counts.get(slot.item.count) ?? 0) > (before.get(slot.item.count) ?? 0),
  );
  if (grown?.status === "occupied") return grown.guid;
  return request.guid;
}

function moveTargets(
  inventory: InventoryState,
  request: MoveRequest,
): InventorySlot[] {
  return bankSlots(inventory).filter(
    (slot) =>
      slot.status === "occupied" &&
      slot.item.entry === request.entry &&
      (request.kind === "deposit"
        ? inBank(slot.region)
        : isCarried(slot.region)),
  );
}

export class BankStore {
  private readonly events = new Emitter<[BankEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private readonly outcomes = new Map<BankMoveRequest, BankResult>();
  private banker: bigint | undefined;
  private request: BankMoveRequest | undefined;
  private last: BankOutcome | undefined;
  private slotResult: string | undefined;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): BankState {
    return {
      bagSlots: readBagSlots(this.deps),
      banker: this.banker,
      lastOutcome: this.last,
      lastSlotResult: this.slotResult,
      pending: this.request,
    };
  }

  onEvent(cb: (event: BankEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  reach(banker: bigint): number | undefined {
    const npc = this.deps.getEntity(banker);
    const self = this.deps.getEntity(this.deps.selfGuid());
    const from = self?.position;
    const to = npc?.position;
    if (!(npc && from && to)) return undefined;
    return distance(
      { x: from.x, y: from.y, z: from.z },
      { x: to.x, y: to.y, z: to.z },
    );
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  begin(request: BankMoveRequest): void {
    if (this.request) throw new Error("a bank request is already pending");
    this.request = request;
    this.last = undefined;
  }

  receiveShowBank(banker: bigint): void {
    this.banker = banker;
    if (this.request?.kind === "open" && this.request.npc === banker)
      this.settle({ status: "ok" }, { banker, type: "opened" });
    else this.events.emit({ banker, type: "opened" });
  }

  receiveSlotResult(name: string): void {
    if (this.request?.kind !== "slot") return;
    this.slotResult = name;
    if (name === "ok") {
      this.settle({ status: "ok" }, { result: name, type: "slot_bought" });
      return;
    }
    this.settle(
      { status: "refused", reason: name },
      { result: name, type: "slot_bought" },
    );
  }

  observeInventory(): void {
    const request = this.request;
    if (request?.kind !== "deposit" && request?.kind !== "withdraw") return;
    if (request.guid === undefined) return;
    const inventory = this.inventory();
    const found = bankSlots(inventory).find(
      (slot) => slot.status === "occupied" && slot.guid === request.guid,
    );
    if (found?.status === "occupied") {
      const moved =
        request.kind === "deposit"
          ? inBank(found.region)
          : !inBank(found.region);
      if (moved) {
        this.settleMove(request, request.guid);
        return;
      }
    }
    if (request.entry === undefined || request.toCounts === undefined) return;
    const guid = merged(request, moveTargets(inventory, request));
    if (guid !== undefined) this.settleMove(request, guid);
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    if (packet.kind !== "error") return;
    const pending = this.request;
    const mine =
      pending?.kind === "deposit" || pending?.kind === "withdraw"
        ? { itemGuid: pending.guid }
        : UNCLAIMED;
    if (!ownsInventoryFailure(packet, mine, legacyClaims(this.core))) return;
    if (isNoChange(packet)) {
      this.noChange();
      return;
    }
    this.refuse(inventoryResultName(packet.result));
  }

  refuse(reason: string): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "refused", reason },
      { kind: request.kind, reason, type: "refused" },
    );
  }

  noChange(): void {
    const request = this.request;
    if (!request || request.kind === "slot" || request.kind === "open") return;
    this.settle(
      { status: "no_change" },
      { kind: request.kind, type: "no_change" },
    );
  }

  expire(): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "unanswered" },
      { kind: request.kind, type: "unanswered" },
    );
  }

  resultOf(request: BankMoveRequest): BankResult | undefined {
    return this.outcomes.get(request);
  }

  takeResult(request: BankMoveRequest): BankResult | undefined {
    const result = this.outcomes.get(request);
    this.outcomes.delete(request);
    return result;
  }

  abandon(): void {
    if (this.request) this.outcomes.delete(this.request);
    this.request = undefined;
  }

  dispose(): void {
    this.abandon();
    this.outcomes.clear();
    this.events.clear();
  }

  private settleMove(request: MoveRequest, guid: bigint): void {
    this.settle({ status: "ok" }, { guid, kind: request.kind, type: "moved" });
  }

  private settle(result: BankResult, event: BankEvent): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, request, observedAt: this.deps.now() };
    this.outcomes.set(request, result);
    this.request = undefined;
    this.events.emit(event);
  }
}
