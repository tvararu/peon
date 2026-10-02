import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AuctionHello,
  AuctionList,
  AuctionRow,
} from "#wow/areas/auction/protocol";
import type { Entity } from "#wow/entity-store";
import { distance } from "#wow/geometry";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const AUCTIONEER_NPC_FLAG = 0x20_00_00;
export const AUCTIONEER_YARDS = 5.5;

export type AuctionListKind = "search" | "owned" | "bids";

export type AuctionRequest =
  | { kind: "open"; npc: bigint; requestedAt: number }
  | { kind: "search"; npc: bigint; from: number; requestedAt: number }
  | { kind: "owned"; npc: bigint; from: number; requestedAt: number }
  | {
      kind: "bids";
      npc: bigint;
      from: number;
      outbidIds: readonly number[];
      requestedAt: number;
    };

export type AuctionResult = { status: "ok" } | { status: "unanswered" };

export type AuctionOutcome = AuctionResult & {
  request: AuctionRequest;
  observedAt: number;
};

export type AuctionState = {
  house: { auctioneer: bigint; houseId: number } | undefined;
  pending: AuctionRequest | undefined;
  search: AuctionList | undefined;
  owned: AuctionList | undefined;
  bids: AuctionList | undefined;
  searchDelayMs: number | undefined;
  lastOutcome: AuctionOutcome | undefined;
};

export type AuctionEvent =
  | { type: "house_opened"; auctioneer: bigint; houseId: number }
  | { type: "listed"; kind: AuctionListKind; rows: readonly AuctionRow[] };

export function auctioneerKind(entity: Entity): "auctioneer" | undefined {
  if (entity.objectType !== 3) return undefined;
  if (!("npcFlags" in entity)) return undefined;
  return (entity.npcFlags & AUCTIONEER_NPC_FLAG) === 0
    ? undefined
    : "auctioneer";
}

export class AuctionStore {
  private readonly events = new Emitter<[AuctionEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private house: { auctioneer: bigint; houseId: number } | undefined;
  private request: AuctionRequest | undefined;
  private search: AuctionList | undefined;
  private owned: AuctionList | undefined;
  private bids: AuctionList | undefined;
  private searchDelayMs: number | undefined;
  private last: AuctionOutcome | undefined;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): AuctionState {
    return {
      bids: this.bids,
      house: this.house,
      lastOutcome: this.last,
      owned: this.owned,
      pending: this.request,
      search: this.search,
      searchDelayMs: this.searchDelayMs,
    };
  }

  onEvent(cb: (event: AuctionEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  reach(auctioneer: bigint): number | undefined {
    const npc = this.deps.getEntity(auctioneer);
    const self = this.deps.getEntity(this.deps.selfGuid());
    const from = self?.position;
    const to = npc?.position;
    if (!(npc && from && to)) return undefined;
    if (auctioneerKind(npc) !== "auctioneer") return undefined;
    return distance(
      { x: from.x, y: from.y, z: from.z },
      { x: to.x, y: to.y, z: to.z },
    );
  }

  begin(request: AuctionRequest): void {
    if (this.request) throw new Error("an auction request is already pending");
    this.request = request;
    this.last = undefined;
  }

  receiveHello(hello: AuctionHello): void {
    this.house = { auctioneer: hello.auctioneer, houseId: hello.houseId };
    this.core.quests.receiveWindow(hello.auctioneer, "auction");
    const opened: AuctionEvent = {
      auctioneer: hello.auctioneer,
      houseId: hello.houseId,
      type: "house_opened",
    };
    if (this.request?.kind === "open" && this.request.npc === hello.auctioneer)
      this.settle({ status: "ok" }, opened);
    else this.events.emit(opened);
  }

  receiveList(kind: AuctionListKind, list: AuctionList): void {
    if (kind === "search") this.search = list;
    if (kind === "owned") this.owned = list;
    if (kind === "bids") this.bids = list;
    this.searchDelayMs = list.searchDelayMs;
    const event: AuctionEvent = { kind, rows: list.rows, type: "listed" };
    const pending = this.request;
    const match =
      (pending?.kind === "search" && kind === "search") ||
      (pending?.kind === "owned" && kind === "owned") ||
      (pending?.kind === "bids" && kind === "bids");
    if (match) this.settle({ status: "ok" }, event);
    else this.events.emit(event);
  }

  expire(): void {
    const request = this.request;
    if (!request) return;
    this.settle({ status: "unanswered" }, undefined);
  }

  abandon(): void {
    this.request = undefined;
  }

  dispose(): void {
    this.abandon();
    this.house = undefined;
    this.search = undefined;
    this.owned = undefined;
    this.bids = undefined;
    this.searchDelayMs = undefined;
    this.last = undefined;
    this.events.clear();
  }

  private settle(result: AuctionResult, event: AuctionEvent | undefined): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, observedAt: this.deps.now(), request };
    this.request = undefined;
    if (event) this.events.emit(event);
  }
}
