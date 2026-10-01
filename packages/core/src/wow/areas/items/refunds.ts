import type {
  RefundInfoPacket,
  RefundResultPacket,
} from "#wow/areas/items/protocol-refund";

export type RefundInfoRequest = {
  itemGuid: bigint;
  entry: number | undefined;
  requestedAt: number;
};

export type RefundInfoStatus = "answered" | "unanswered";

export type RefundInfoOutcome = {
  status: RefundInfoStatus;
  info: RefundInfoPacket | undefined;
  request: RefundInfoRequest;
  observedAt: number;
};

export type RefundRequest = {
  itemGuid: bigint;
  entry: number | undefined;
  requestedAt: number;
};

export type RefundStatus = "confirmed" | "refused" | "unanswered";

export type RefundOutcome = {
  status: RefundStatus;
  reason: string | undefined;
  request: RefundRequest;
  result: RefundResultPacket | undefined;
  observedAt: number;
};

export type RefundsState = {
  infoPending: RefundInfoRequest | undefined;
  lastInfo: RefundInfoOutcome | undefined;
  offers: readonly RefundInfoPacket[];
  refundPending: RefundRequest | undefined;
  last: RefundOutcome | undefined;
};

export class RefundSlice {
  private infoPending: RefundInfoRequest | undefined;
  private lastInfo: RefundInfoOutcome | undefined;
  private readonly offers = new Map<bigint, RefundInfoPacket>();
  private pending: RefundRequest | undefined;
  private last: RefundOutcome | undefined;

  snapshot(): RefundsState {
    return {
      infoPending: this.infoPending,
      lastInfo: this.lastInfo,
      offers: [...this.offers.values()],
      refundPending: this.pending,
      last: this.last,
    };
  }

  offer(itemGuid: bigint): RefundInfoPacket | undefined {
    return this.offers.get(itemGuid);
  }

  beginInfo(request: RefundInfoRequest): void {
    this.infoPending = request;
    this.lastInfo = undefined;
  }

  receiveInfo(
    packet: RefundInfoPacket,
    now: number,
  ): { request: RefundInfoRequest; info: RefundInfoPacket } | undefined {
    this.offers.set(packet.itemGuid, packet);
    const request = this.infoPending;
    if (!request || request.itemGuid !== packet.itemGuid) return undefined;
    this.infoPending = undefined;
    this.lastInfo = {
      status: "answered",
      info: packet,
      request,
      observedAt: now,
    };
    return { request, info: packet };
  }

  expireInfo(now: number): RefundInfoOutcome | undefined {
    const request = this.infoPending;
    if (!request) return undefined;
    this.infoPending = undefined;
    this.lastInfo = {
      status: "unanswered",
      info: undefined,
      request,
      observedAt: now,
    };
    return this.lastInfo;
  }

  abandonInfo(): void {
    this.infoPending = undefined;
  }

  beginRefund(request: RefundRequest): void {
    this.pending = request;
    this.last = undefined;
  }

  confirm(packet: RefundResultPacket, now: number): RefundOutcome | undefined {
    const request = this.pending;
    if (!request || request.itemGuid !== packet.itemGuid) return undefined;
    return this.settle({
      status: packet.result === 0 ? "confirmed" : "refused",
      reason: packet.result === 0 ? undefined : "refund_failed",
      result: packet,
      observedAt: now,
    });
  }

  expireRefund(now: number): RefundOutcome | undefined {
    return this.settle({
      status: "unanswered",
      reason: "server_unanswered",
      result: undefined,
      observedAt: now,
    });
  }

  abandonRefund(): void {
    this.pending = undefined;
  }

  clear(): void {
    this.infoPending = undefined;
    this.lastInfo = undefined;
    this.offers.clear();
    this.pending = undefined;
    this.last = undefined;
  }

  private settle(
    init: Omit<RefundOutcome, "request">,
  ): RefundOutcome | undefined {
    const request = this.pending;
    if (!request) return undefined;
    this.pending = undefined;
    this.last = { ...init, request };
    return this.last;
  }
}
