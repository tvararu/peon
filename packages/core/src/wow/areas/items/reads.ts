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

export type SetItemName = {
  entry: number;
  name: string;
  inventoryType: number;
};

export class NameSlice {
  private readonly names = new Map<number, SetItemName>();
  private readonly absent = new Set<number>();
  private waiting = new Map<
    number,
    PromiseWithResolvers<SetItemName | undefined>
  >();

  get(entry: number): SetItemName | undefined {
    return this.names.get(entry);
  }

  await(entry: number): {
    promise: Promise<SetItemName | undefined>;
    first: boolean;
  } {
    const known = this.names.get(entry);
    if (known) return { promise: Promise.resolve(known), first: false };
    if (this.absent.has(entry))
      return { promise: Promise.resolve(undefined), first: false };
    const wait = this.waiting.get(entry);
    if (wait) return { promise: wait.promise, first: false };
    const query = Promise.withResolvers<SetItemName | undefined>();
    this.waiting.set(entry, query);
    return { promise: query.promise, first: true };
  }

  receive(response: SetItemName): SetItemName | undefined {
    if (this.names.has(response.entry)) return undefined;
    this.names.set(response.entry, response);
    this.absent.delete(response.entry);
    this.release(response.entry, response);
    return response;
  }

  expire(entry: number): boolean {
    if (!this.waiting.has(entry)) return false;
    this.absent.add(entry);
    this.release(entry, undefined);
    return true;
  }

  drop(entry: number): void {
    this.release(entry, undefined);
  }

  clear(): void {
    for (const wait of this.waiting.values()) wait.resolve(undefined);
    this.waiting = new Map();
    this.names.clear();
    this.absent.clear();
  }

  private release(entry: number, name: SetItemName | undefined): void {
    this.waiting.get(entry)?.resolve(name);
    this.waiting.delete(entry);
  }
}
