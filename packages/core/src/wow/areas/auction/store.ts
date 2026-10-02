import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AuctionBidderNotice,
  AuctionCommandResult,
  AuctionHello,
  AuctionList,
  AuctionOwnerNotice,
  AuctionRow,
} from "#wow/areas/auction/protocol";
import type { Entity } from "#wow/entity-store";
import { distance } from "#wow/geometry";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const AUCTIONEER_NPC_FLAG = 0x20_00_00;
export const AUCTIONEER_YARDS = 5.5;

export type AuctionListKind = "search" | "owned" | "bids";

export const AUCTION_NOTICE_LIMIT = 20;

export const AUCTION_ERROR_WORDS: Record<number, string> = {
  2: "database_error",
  3: "not_enough_money",
  4: "item_not_found",
  5: "higher_bid",
  7: "bid_increment",
  10: "bid_own",
  13: "restricted_account",
};

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
    }
  | { kind: "sell"; npc: bigint; requestedAt: number }
  | { kind: "cancel"; npc: bigint; id: number; requestedAt: number }
  | { kind: "bid"; npc: bigint; id: number; price: number; requestedAt: number }
  | { kind: "pending"; npc: bigint; requestedAt: number };

export type AuctionResult =
  | { status: "ok"; auctionId?: number; bidError?: number }
  | { status: "refused"; why: string }
  | { status: "unanswered" };

export type AuctionOutcome = AuctionResult & {
  request: AuctionRequest;
  observedAt: number;
};

export type AuctionNotice =
  | { kind: "won"; auctionId: number; houseId: number; itemEntry: number }
  | {
      kind: "outbid";
      auctionId: number;
      houseId: number;
      bidSum: number;
      diff: number;
      itemEntry: number;
    }
  | { kind: "sold"; auctionId: number; bid: number; itemEntry: number };

export type AuctionState = {
  house: { auctioneer: bigint; houseId: number } | undefined;
  pending: AuctionRequest | undefined;
  search: AuctionList | undefined;
  owned: AuctionList | undefined;
  bids: AuctionList | undefined;
  searchDelayMs: number | undefined;
  notices: readonly AuctionNotice[] | undefined;
  pendingCount: number | undefined;
  lastOutcome: AuctionOutcome | undefined;
};

export type AuctionEvent =
  | { type: "house_opened"; auctioneer: bigint; houseId: number }
  | { type: "listed"; kind: AuctionListKind; rows: readonly AuctionRow[] }
  | {
      type: "command_result";
      action: "sell" | "cancel" | "bid";
      auctionId: number;
      result: AuctionResult;
    }
  | { type: "won"; auctionId: number; houseId: number; itemEntry: number }
  | {
      type: "outbid";
      auctionId: number;
      houseId: number;
      bidSum: number;
      diff: number;
      itemEntry: number;
    }
  | { type: "sold"; auctionId: number; bid: number; itemEntry: number }
  | { type: "pending_sales"; count: number };

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
  private notices: AuctionNotice[] = [];
  private pendingCount: number | undefined;
  private last: AuctionOutcome | undefined;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  entityOf: SessionDeps["getEntity"] = (guid) => this.deps.getEntity(guid);

  snapshot(): AuctionState {
    return {
      bids: this.bids,
      house: this.house,
      lastOutcome: this.last,
      notices: this.notices.length === 0 ? undefined : [...this.notices],
      owned: this.owned,
      pending: this.request,
      pendingCount: this.pendingCount,
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

  receiveCommandResult(result: AuctionCommandResult): void {
    const kinds = { 0: "sell", 1: "cancel", 2: "bid" } as const;
    const action = kinds[result.action] ?? "sell";
    const outcome: AuctionResult =
      result.error === 0
        ? {
            ...(result.bidError === undefined
              ? {}
              : { bidError: result.bidError }),
            auctionId: result.auctionId,
            status: "ok",
          }
        : {
            status: "refused",
            why: AUCTION_ERROR_WORDS[result.error] ?? `error_${result.error}`,
          };
    const event: AuctionEvent = {
      action,
      auctionId: result.auctionId,
      result: outcome,
      type: "command_result",
    };
    if (this.request?.kind === action) this.settle(outcome, event);
    else this.events.emit(event);
  }

  receiveBidderNotice(notice: AuctionBidderNotice): void {
    if (notice.bidSum === 0) {
      const won: AuctionNotice = {
        auctionId: notice.auctionId,
        houseId: notice.houseId,
        itemEntry: notice.itemEntry,
        kind: "won",
      };
      this.keepNotice(won);
      this.events.emit({
        auctionId: won.auctionId,
        houseId: won.houseId,
        itemEntry: won.itemEntry,
        type: "won",
      });
    } else {
      const outbid: AuctionNotice = {
        auctionId: notice.auctionId,
        bidSum: notice.bidSum,
        diff: notice.diff,
        houseId: notice.houseId,
        itemEntry: notice.itemEntry,
        kind: "outbid",
      };
      this.keepNotice(outbid);
      this.events.emit({
        auctionId: outbid.auctionId,
        bidSum: outbid.bidSum,
        diff: outbid.diff,
        houseId: outbid.houseId,
        itemEntry: outbid.itemEntry,
        type: "outbid",
      });
    }
  }

  receiveOwnerNotice(notice: AuctionOwnerNotice): void {
    const sold: AuctionNotice = {
      auctionId: notice.auctionId,
      bid: notice.bid,
      itemEntry: notice.itemEntry,
      kind: "sold",
    };
    this.keepNotice(sold);
    this.events.emit({
      auctionId: sold.auctionId,
      bid: sold.bid,
      itemEntry: sold.itemEntry,
      type: "sold",
    });
  }

  receivePendingSales(count: number): void {
    this.pendingCount = count;
    const event: AuctionEvent = { count, type: "pending_sales" };
    if (this.request?.kind === "pending") this.settle({ status: "ok" }, event);
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
    this.notices = [];
    this.pendingCount = undefined;
    this.last = undefined;
    this.events.clear();
  }

  private keepNotice(notice: AuctionNotice): void {
    this.notices.push(notice);
    if (this.notices.length > AUCTION_NOTICE_LIMIT)
      this.notices.splice(0, this.notices.length - AUCTION_NOTICE_LIMIT);
  }

  private settle(result: AuctionResult, event: AuctionEvent | undefined): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, observedAt: this.deps.now(), request };
    this.request = undefined;
    if (event) this.events.emit(event);
  }
}
