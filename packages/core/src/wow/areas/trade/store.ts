import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { TradeStatus } from "#wow/areas/trade/protocol";
import { tradeStatusName } from "#wow/areas/trade/protocol";
import type { SessionDeps } from "#wow/session-stores";

export type TradePhase =
  | "idle"
  | "requested_out"
  | "requested_in"
  | "open"
  | "closed";

export type TradeOfferItem = {
  slot: number;
  guid: bigint;
  entry: number | undefined;
  count: number | undefined;
};

export type TradeOffer = {
  gold: number;
  items: readonly TradeOfferItem[];
};

export type TradeLastOutcome =
  | { kind: "canceled"; status: string }
  | { kind: "refused"; status: string };

export type TradeState = {
  phase: TradePhase;
  with: bigint | undefined;
  from: bigint | undefined;
  ownOffer: TradeOffer;
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
  | { type: "unanswered" };

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

const EMPTY_OFFER: TradeOffer = { gold: 0, items: [] };
export class TradeStore {
  private readonly events = new Emitter<[TradeEvent]>();
  private readonly deps: SessionDeps;
  private phase: TradePhase = "idle";
  private partner: bigint | undefined;
  private from: bigint | undefined;
  private last: TradeLastOutcome | undefined;
  private dropped = 0;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): TradeState {
    return {
      dropped: this.dropped,
      from: this.from,
      lastOutcome: this.last,
      ownOffer: { ...EMPTY_OFFER, items: [] },
      phase: this.phase,
      selfAccepted: false,
      theirOffer: { ...EMPTY_OFFER, items: [] },
      theyAccepted: false,
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
  }

  receiveStatus(status: TradeStatus): void {
    const name = status.statusName;
    if (status.kind === "trader") {
      this.phase = "requested_in";
      this.from = status.trader;
      this.partner = status.trader;
      this.last = undefined;
      this.events.emit({ from: status.trader, type: "requested" });
      return;
    }
    if (status.kind === "open_window") {
      this.phase = "open";
      this.last = undefined;
      this.events.emit({ type: "opened", with: this.partner ?? 0n });
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

  expire(): void {
    this.last = undefined;
    this.events.emit({ type: "unanswered" });
  }

  settlePending(): void {
    if (this.phase !== "requested_out") return;
    this.abandon();
  }

  abandon(): void {
    this.phase = "idle";
    this.partner = undefined;
    this.from = undefined;
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
