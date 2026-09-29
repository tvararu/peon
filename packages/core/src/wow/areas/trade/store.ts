import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  TradeStatus,
  TradeStatusExtended,
} from "#wow/areas/trade/protocol";
import { tradeStatusName } from "#wow/areas/trade/protocol";
import type { SessionDeps } from "#wow/session-stores";

export type TradePhase =
  | "idle"
  | "requested_out"
  | "requested_in"
  | "open"
  | "closed"
  | "settling";

export type TradeOfferItem = {
  slot: number;
  guid: bigint | undefined;
  entry: number | undefined;
  count: number | undefined;
};

export type TradeOffer = {
  gold: number;
  spell: number;
  version: number;
  items: readonly TradeOfferItem[];
};

export type TradeLastOutcome =
  | { kind: "canceled"; status: string }
  | {
      kind: "refused";
      status: string;
      equipResult?: number;
      targetError?: boolean;
      limitItem?: number;
    }
  | { kind: "completed"; gave: TradeOffer; got: TradeOffer };

export type TradeState = {
  phase: TradePhase;
  with: bigint | undefined;
  from: bigint | undefined;
  ownOffer: TradeOffer;
  ownEcho: TradeOffer | undefined;
  theirOffer: TradeOffer;
  selfAccepted: boolean;
  theyAccepted: boolean;
  lastOutcome: TradeLastOutcome | undefined;
  dropped: number;
};

export type TradeEvent =
  | { type: "requested"; from: bigint }
  | { type: "opened"; with: bigint }
  | { type: "canceled"; status: string }
  | { type: "refused"; status: string }
  | { type: "unanswered" }
  | { type: "offer_changed"; version: number }
  | { type: "back_to_trade" }
  | { type: "they_accepted" }
  | { type: "completed" };

const CANCEL_STATUSES: Record<string, true> = {
  busy: true,
  ignore_you: true,
  trade_canceled: true,
};

const REFUSE_STATUSES: Record<string, true> = {
  no_target: true,
  target_dead: true,
  target_logout: true,
  target_stunned: true,
  target_to_far: true,
  trial_account: true,
  wrong_faction: true,
  you_dead: true,
  you_logout: true,
  you_stunned: true,
};

const EMPTY_OFFER: TradeOffer = { gold: 0, items: [], spell: 0, version: 0 };
export class TradeStore {
  private readonly events = new Emitter<[TradeEvent]>();
  private readonly deps: SessionDeps;
  private phase: TradePhase = "idle";
  private partner: bigint | undefined;
  private from: bigint | undefined;
  private last: TradeLastOutcome | undefined;
  private dropped = 0;
  private own: TradeOffer = { gold: 0, items: [], spell: 0, version: 0 };
  private echo: TradeOffer | undefined;
  private theirs: TradeOffer = { gold: 0, items: [], spell: 0, version: 0 };
  private accepted = false;
  private partnerAccepted = false;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  entityOf: SessionDeps["getEntity"] = (guid) => this.deps.getEntity(guid);

  snapshot(): TradeState {
    return {
      dropped: this.dropped,
      from: this.from,
      lastOutcome: this.last,
      ownEcho: this.echo,
      ownOffer: { ...this.own, items: [...this.own.items] },
      phase: this.phase,
      selfAccepted: this.accepted,
      theirOffer: { ...this.theirs, items: [...this.theirs.items] },
      theyAccepted: this.partnerAccepted,
      with: this.partner,
    };
  }

  onEvent(cb: (event: TradeEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  beginRequest(to: bigint): void {
    this.phase = "requested_out";
    this.partner = to;
    this.from = undefined;
    this.last = undefined;
    this.resetOffers();
  }

  receiveStatus(status: TradeStatus): void {
    const name = status.statusName;
    if (status.kind === "trader") {
      this.phase = "requested_in";
      this.from = status.trader;
      this.partner = status.trader;
      this.last = undefined;
      this.resetOffers();
      this.events.emit({ from: status.trader, type: "requested" });
      return;
    }
    if (status.kind === "open_window") {
      if (this.phase === "settling") {
        this.dropped += 1;
        return;
      }
      this.phase = "open";
      this.last = undefined;
      this.resetOffers();
      this.events.emit({ type: "opened", with: this.partner ?? 0n });
      return;
    }
    if (this.phase === "settling") {
      if (name === "trade_canceled") {
        this.abandon();
        this.last = { kind: "canceled", status: name };
        this.events.emit({ status: name, type: "canceled" });
        return;
      }
      this.dropped += 1;
      return;
    }
    if (this.receiveOfferStatus(name)) return;
    if (status.kind === "close_window") {
      this.abandon();
      this.last = {
        equipResult: status.result,
        kind: "refused",
        limitItem: status.limitItem,
        status: name,
        targetError: status.isTarget,
      };
      this.events.emit({ status: name, type: "refused" });
      return;
    }
    if (CANCEL_STATUSES[name]) {
      if (this.phase === "idle") {
        this.dropped += 1;
        return;
      }
      this.phase = "closed";
      this.last = { kind: "canceled", status: name };
      this.events.emit({ status: name, type: "canceled" });
      return;
    }
    if (REFUSE_STATUSES[name]) {
      this.abandon();
      this.last = { kind: "refused", status: name };
      this.events.emit({ status: name, type: "refused" });
    }
  }

  private receiveOfferStatus(name: string): boolean {
    if (name === "back_to_trade") {
      this.accepted = false;
      this.partnerAccepted = false;
      this.theirs = { ...this.theirs, version: this.theirs.version + 1 };
      this.events.emit({ type: "back_to_trade" });
      return true;
    }
    if (name === "trade_accept") {
      this.partnerAccepted = true;
      this.events.emit({ type: "they_accepted" });
      return true;
    }
    if (name === "trade_complete") {
      this.last = {
        gave: { ...this.own, items: [...this.own.items] },
        got: { ...this.theirs, items: [...this.theirs.items] },
        kind: "completed",
      };
      this.events.emit({ type: "completed" });
      return true;
    }
    return false;
  }

  expire(): void {
    this.last = undefined;
    this.events.emit({ type: "unanswered" });
  }

  settlePending(): void {
    if (this.phase !== "requested_out") return;
    this.phase = "settling";
  }

  settleCancel(): void {
    if (
      this.phase !== "open" &&
      this.phase !== "requested_in" &&
      this.phase !== "requested_out"
    )
      return;
    this.phase = "settling";
  }

  restorePhase(phase: TradePhase): void {
    this.phase = phase;
  }

  endSettling(): void {
    if (this.phase !== "settling") return;
    this.abandon();
  }

  abandon(): void {
    this.phase = "idle";
    this.partner = undefined;
    this.from = undefined;
    this.resetOffers();
  }

  receiveExtended(extended: TradeStatusExtended): void {
    const offer: TradeOffer = {
      gold: extended.gold,
      items: extended.items.map((item) => ({
        count: item.count,
        entry: item.entry,
        guid: undefined,
        slot: item.slot,
      })),
      spell: extended.spell,
      version: this.theirs.version + 1,
    };
    if (extended.side === 1) {
      this.theirs = offer;
      this.events.emit({
        type: "offer_changed",
        version: offer.version,
      });
      return;
    }
    this.echo = { ...offer, version: this.own.version };
  }

  recordOwnOffer(offer: {
    gold: number;
    spell?: number;
    items?: readonly TradeOfferItem[];
  }): void {
    this.own = {
      gold: offer.gold,
      items: offer.items ? [...offer.items] : [],
      spell: offer.spell ?? 0,
      version: this.own.version + 1,
    };
  }

  noteSelfAccepted(accepted: boolean): void {
    this.accepted = accepted;
  }

  noteTheyAccepted(): void {
    this.partnerAccepted = true;
  }

  private resetOffers(): void {
    this.own = { ...EMPTY_OFFER, items: [] };
    this.echo = undefined;
    this.theirs = { ...EMPTY_OFFER, items: [] };
    this.accepted = false;
    this.partnerAccepted = false;
  }

  dispose(): void {
    this.abandon();
    this.events.clear();
  }

  statusName(status: number): string {
    return tradeStatusName(status);
  }

  now(): number {
    return this.deps.now();
  }
}
