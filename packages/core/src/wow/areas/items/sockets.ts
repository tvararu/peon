import type { SocketGemsResultPacket } from "#wow/areas/items/protocol-sockets";
import type { InventoryClaim } from "#wow/protocol/inventory";

export type SocketRequest = {
  itemGuid: bigint;
  entry: number | undefined;
  gems: readonly bigint[];
  requestedAt: number;
};
export type SocketStatus = "confirmed" | "refused" | "unanswered";
export type SocketOutcome = {
  status: SocketStatus;
  reason: string | undefined;
  request: SocketRequest;
  sockets: [number, number, number] | undefined;
  bonus: number | undefined;
  observedAt: number;
};
export type SocketState = {
  pending: SocketRequest | undefined;
  last: SocketOutcome | undefined;
};

export class SocketSlice {
  private pending: SocketRequest | undefined;
  private last: SocketOutcome | undefined;

  get request(): SocketRequest | undefined {
    return this.pending;
  }

  snapshot(): SocketState {
    return { pending: this.pending, last: this.last };
  }

  claim(): InventoryClaim | undefined {
    return this.pending && { itemGuid: this.pending.itemGuid };
  }

  begin(request: SocketRequest): void {
    this.pending = request;
    this.last = undefined;
  }

  confirm(
    packet: SocketGemsResultPacket,
    now: number,
  ): SocketOutcome | undefined {
    if (this.pending?.itemGuid !== packet.itemGuid) return undefined;
    return this.settle({
      bonus: packet.bonus,
      observedAt: now,
      reason: undefined,
      sockets: packet.sockets,
      status: "confirmed",
    });
  }

  fail(
    status: "refused" | "unanswered",
    reason: string,
    now: number,
  ): SocketOutcome | undefined {
    return this.settle({
      bonus: undefined,
      observedAt: now,
      reason,
      sockets: undefined,
      status,
    });
  }

  abandon(): void {
    this.pending = undefined;
  }

  clear(): void {
    this.pending = undefined;
    this.last = undefined;
  }

  private settle(
    init: Omit<SocketOutcome, "request">,
  ): SocketOutcome | undefined {
    const request = this.pending;
    if (!request) return undefined;
    this.pending = undefined;
    this.last = { ...init, request };
    return this.last;
  }
}
