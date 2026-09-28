import type { ItemPosition } from "#wow/areas/items/protocol";
import type { ItemTextResponse } from "#wow/areas/items/protocol-read";
import type { InventoryClaim } from "#wow/protocol/inventory";

export type ReadKind = "read" | "open";
export type ReadRequest = {
  kind: ReadKind;
  itemGuid: bigint;
  entry: number | undefined;
  from: ItemPosition;
  requestedAt: number;
};
export type ReadStatus = "ok" | "failed" | "unanswered";
export type ReadOutcome = {
  status: ReadStatus;
  reason: string | undefined;
  request: ReadRequest;
  observedAt: number;
};
export type ItemText = { guid: bigint; text: string };
export type ReadState = {
  pending: ReadRequest | undefined;
  last: ReadOutcome | undefined;
  texts: readonly ItemText[];
};

type Waiting = {
  guid: bigint;
  query: PromiseWithResolvers<string | undefined>;
};

export class ReadSlice {
  private pending: ReadRequest | undefined;
  private last: ReadOutcome | undefined;
  private readonly texts = new Map<bigint, string>();
  private waiting: Waiting[] = [];

  snapshot(): ReadState {
    return {
      pending: this.pending,
      last: this.last,
      texts: [...this.texts].map(([guid, text]) => ({ guid, text })),
    };
  }

  get request(): ReadRequest | undefined {
    return this.pending;
  }

  claim(): InventoryClaim | undefined {
    return this.pending && { itemGuid: this.pending.itemGuid };
  }

  begin(request: ReadRequest): void {
    this.pending = request;
    this.last = undefined;
  }

  settle(
    status: ReadStatus,
    reason: string | undefined,
    observedAt: number,
  ): ReadRequest | undefined {
    const request = this.pending;
    if (!request) return undefined;
    this.last = { status, reason, request, observedAt };
    this.pending = undefined;
    return request;
  }

  abandon(): void {
    this.pending = undefined;
  }

  text(guid: bigint): string | undefined {
    return this.texts.get(guid);
  }

  awaitText(guid: bigint): {
    promise: Promise<string | undefined>;
    first: boolean;
  } {
    const known = this.waiting.find((wait) => wait.guid === guid);
    if (known) return { promise: known.query.promise, first: false };
    const query = Promise.withResolvers<string | undefined>();
    this.waiting.push({ guid, query });
    return { promise: query.promise, first: true };
  }

  dropText(guid: bigint): void {
    this.waiting = this.waiting.filter((wait) => wait.guid !== guid);
  }

  receiveText(response: ItemTextResponse): ItemText | undefined {
    if (!response.found) {
      this.waiting.shift()?.query.resolve(undefined);
      return undefined;
    }
    const { guid, text } = response;
    this.texts.set(guid, text);
    for (const wait of this.waiting)
      if (wait.guid === guid) wait.query.resolve(text);
    this.dropText(guid);
    return { guid, text };
  }

  clear(): void {
    this.pending = undefined;
    this.last = undefined;
    this.texts.clear();
    for (const wait of this.waiting) wait.query.resolve(undefined);
    this.waiting = [];
  }
}
