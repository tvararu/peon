import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { DestroyStore } from "#wow/destroy-store";
import type { EntityLookup } from "#wow/entity-store";
import { readLife } from "#wow/player-state";
import { buildDestroyItem } from "#wow/protocol/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";

export type DestroyDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export const DESTROY_ANSWER_MS = 5000;
const MAX_PARTIAL_COUNT = 255;

export type DestroyRequest = {
  bag: number;
  slot: number;
  itemGuid: bigint;
  itemId: number | undefined;
  count: number;
  stackBefore: number;
  requestedAt: number;
};

export type DestroyOutcome = {
  status: "confirmed" | "refused" | "unanswered";
  reason: string | undefined;
  request: DestroyRequest;
  stackAfter: number;
  observedAt: number;
};

export type DestroyState = {
  pending: DestroyRequest | undefined;
  lastOutcome: DestroyOutcome | undefined;
};

export type DestroyEvent = {
  type: "requested" | "destroyed" | "refused" | "unanswered";
  at: number;
  state: DestroyState;
};

export class ItemDestroyRuntime {
  private readonly events = new Emitter<[DestroyEvent]>();
  private readonly store: DestroyStore;
  private readonly deps: DestroyDeps;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(store: DestroyStore, deps: DestroyDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((event) => {
      clearTimeout(this.timer);
      this.timer =
        event.type === "requested"
          ? setTimeout(() => this.store.expire(), DESTROY_ANSWER_MS)
          : undefined;
      this.events.emit(event);
    });
  }

  onEvent(listener: (event: DestroyEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  snapshot(): DestroyState {
    return this.store.snapshot();
  }

  destroy(bag: number, slot: number, count?: number): DestroyState {
    const self = this.deps.selfGuid();
    if (this.disposed || this.store.disposed)
      throw new Error("Destroy runtime disposed");
    if (!self) throw new Error("Authenticated player GUID is unknown");
    if (readLife(self, this.deps.getEntity).life !== "alive")
      throw new Error("Destroy requires authoritative alive state");
    if (this.store.pending)
      throw new Error("Previous destroy request remains unanswered");
    const held = this.store
      .inventory()
      .slots.find(
        (candidate) => candidate.bag === bag && candidate.slot === slot,
      );
    if (held?.status !== "occupied" || held.region === "equipment")
      throw new Error(`No carried bag item at bag ${bag} slot ${slot}`);
    const stackBefore = held.item.count ?? 1;
    const destroyed = count ?? stackBefore;
    if (destroyed > stackBefore)
      throw new Error("Destroy count exceeds the stack");
    const whole = destroyed === stackBefore;
    if (!whole && destroyed > MAX_PARTIAL_COUNT)
      throw new Error("Partial destroy count is limited to 255");
    this.deps.send(
      GameOpcode.CMSG_DESTROYITEM,
      buildDestroyItem(bag, slot, whole ? 0 : destroyed),
    );
    return this.store.begin({
      bag,
      slot,
      itemGuid: held.guid,
      itemId: held.item.entry,
      count: destroyed,
      stackBefore,
      requestedAt: this.deps.now(),
    });
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.events.clear();
  }
}
