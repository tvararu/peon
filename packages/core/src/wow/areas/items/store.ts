import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  type MoveKind,
  type MoveOutcome,
  type MoveRequest,
  type MoveState,
  moveSettled,
} from "#wow/areas/items/moves";
import type {
  ItemTextResponse,
  ReadItemResult,
} from "#wow/areas/items/protocol-read";
import {
  type ItemText,
  type ReadRequest,
  ReadSlice,
  type ReadState,
} from "#wow/areas/items/reads";
import { type InventoryState, readInventory } from "#wow/inventory";
import { type PlayerLife, readLife } from "#wow/player-state";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
  isNoChange,
  ownsInventoryFailure,
} from "#wow/protocol/inventory";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type ItemsState = { move: MoveState; read: ReadState };

type ReadHead = { itemGuid: bigint; entry: number | undefined };
type MoveHead = { kind: MoveKind; itemGuid: bigint; entry: number | undefined };
export type ItemReceived = {
  entry: number;
  guid: bigint | undefined;
  itemLevel: number;
  inventoryType: number;
  wornItemLevel: number | undefined;
};
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
  | ({ type: "item_text" } & ItemText);

function legacyClaims(core: CoreStores): (InventoryClaim | undefined)[] {
  return [core.rewards, core.vendor, core.quests, core.destroy].map((store) =>
    store.inventoryClaim(),
  );
}

const readHead = ({ itemGuid, entry }: ReadRequest): ReadHead => ({
  itemGuid,
  entry,
});

const head = ({ kind, itemGuid, entry }: MoveRequest): MoveHead => ({
  kind,
  itemGuid,
  entry,
});

export class ItemsStore {
  private readonly events = new Emitter<[ItemsEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private readonly reads = new ReadSlice();
  private pending: MoveRequest | undefined;
  private last: MoveOutcome | undefined;
  private seen: InventoryClaim[] = [];

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): ItemsState {
    return {
      move: { pending: this.pending, last: this.last },
      read: this.reads.snapshot(),
    };
  }

  onEvent(cb: (event: ItemsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  life(): PlayerLife {
    return readLife(this.deps.selfGuid(), this.deps.getEntity).life;
  }

  begin(request: MoveRequest): void {
    this.startClaims();
    this.pending = request;
    this.last = undefined;
    this.noteClaims();
    this.events.emit({ type: "move_requested", ...head(request) });
  }

  beginRead(request: ReadRequest): void {
    this.startClaims();
    this.reads.begin(request);
    this.noteClaims();
    if (request.kind === "read")
      this.events.emit({ type: "read_requested", ...readHead(request) });
  }

  noteClaims(): void {
    if (!(this.pending || this.reads.request)) return;
    for (const claim of legacyClaims(this.core))
      if (claim) this.seen.push(claim);
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    if (packet.kind !== "error") return;
    const legacy = [...legacyClaims(this.core), ...this.seen];
    const move = this.pending && { itemGuid: this.pending.itemGuid };
    const read = this.reads.claim();
    if (move && ownsInventoryFailure(packet, move, [...legacy, read]))
      this.failMove(packet);
    else if (read && ownsInventoryFailure(packet, read, [...legacy, move]))
      this.failRead(inventoryResultName(packet.result), packet.result);
  }

  receiveReadOk({ guid }: ReadItemResult): void {
    const request = this.reads.request;
    if (request?.kind !== "read" || request.itemGuid !== guid) return;
    this.settleRead("ok", undefined, { type: "read_ok", ...readHead(request) });
  }

  receiveReadFailed({ guid }: ReadItemResult): void {
    const request = this.reads.request;
    if (request?.kind !== "read" || request.itemGuid !== guid) return;
    this.failRead("read_item_failed", undefined);
  }

  settleOpen(status: "ok" | "failed", reason?: string): void {
    if (this.reads.request?.kind !== "open") return;
    this.reads.settle(status, reason, this.deps.now());
    this.releaseClaims();
  }

  expireRead(): void {
    const request = this.reads.request;
    if (!request) return;
    if (request.kind === "open") {
      this.reads.settle("unanswered", "server_unanswered", this.deps.now());
      this.releaseClaims();
      this.core.rewards.failOpen("server_unanswered");
      return;
    }
    this.settleRead("unanswered", "server_unanswered", {
      type: "read_unanswered",
      ...readHead(request),
    });
  }

  abandonRead(): void {
    this.reads.abandon();
    this.releaseClaims();
  }

  receiveItemText(response: ItemTextResponse): void {
    const found = this.reads.receiveText(response);
    if (found) this.events.emit({ type: "item_text", ...found });
  }

  text(guid: bigint): string | undefined {
    return this.reads.text(guid);
  }

  awaitText(guid: bigint): ReturnType<ReadSlice["awaitText"]> {
    return this.reads.awaitText(guid);
  }

  dropText(guid: bigint): void {
    this.reads.dropText(guid);
  }

  observeInventory(): void {
    const request = this.pending;
    if (!(request && moveSettled(request, this.inventory()))) return;
    this.settle("confirmed", undefined, { type: "moved", ...head(request) });
  }

  expire(): void {
    const request = this.pending;
    if (!request) return;
    this.settle("unanswered", "server_unanswered", {
      type: "move_unanswered",
      ...head(request),
    });
  }

  abandon(): void {
    this.pending = undefined;
    this.releaseClaims();
  }

  receiveItem(item: ItemReceived): void {
    this.events.emit({ type: "item_received", ...item });
  }

  dispose(): void {
    this.abandon();
    this.reads.clear();
    this.seen = [];
    this.events.clear();
  }

  private startClaims(): void {
    if (!(this.pending || this.reads.request)) this.seen = [];
  }

  private releaseClaims(): void {
    if (!(this.pending || this.reads.request)) this.seen = [];
  }

  private failMove(packet: Extract<InventoryChangeFailure, { kind: "error" }>) {
    const request = this.pending;
    if (!request) return;
    const reason = inventoryResultName(packet.result);
    if (isNoChange(packet))
      this.settle("no_change", reason, {
        type: "move_no_change",
        ...head(request),
      });
    else
      this.settle("refused", reason, {
        type: "move_refused",
        reason,
        result: packet.result,
        ...head(request),
      });
  }

  private failRead(reason: string, result: number | undefined): void {
    const request = this.reads.request;
    if (!request) return;
    if (request.kind === "open") {
      this.settleOpen("failed", reason);
      this.core.rewards.failOpen(reason);
      return;
    }
    this.settleRead("failed", reason, {
      type: "read_failed",
      reason,
      result,
      ...readHead(request),
    });
  }

  private settleRead(
    status: "ok" | "failed" | "unanswered",
    reason: string | undefined,
    event: ItemsEvent,
  ): void {
    if (!this.reads.settle(status, reason, this.deps.now())) return;
    this.releaseClaims();
    this.events.emit(event);
  }

  private settle(
    status: MoveOutcome["status"],
    reason: string | undefined,
    event: ItemsEvent,
  ): void {
    const request = this.pending;
    if (!request) return;
    this.last = { status, reason, request, observedAt: this.deps.now() };
    this.abandon();
    this.events.emit(event);
  }
}
