import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ItemReceived,
  ItemsEvent,
  MoveHead,
  ReadHead,
} from "#wow/areas/items/events";
import {
  findItem,
  type MoveOutcome,
  type MoveRequest,
  type MoveState,
  moveSettled,
} from "#wow/areas/items/moves";
import type {
  ItemTextResponse,
  ReadItemResult,
} from "#wow/areas/items/protocol-read";
import type {
  EnchantmentLogPacket,
  SocketGemsResultPacket,
} from "#wow/areas/items/protocol-sockets";
import type {
  ItemCooldownPacket,
  ItemEnchantTimeUpdatePacket,
  ItemTimeUpdatePacket,
  SetProficiencyPacket,
} from "#wow/areas/items/protocol-timers";
import {
  type ReadRequest,
  ReadSlice,
  type ReadState,
} from "#wow/areas/items/reads";
import {
  type SaveRequest,
  SetSlice,
  type SetsState,
} from "#wow/areas/items/sets";
import {
  type SocketOutcome,
  type SocketRequest,
  SocketSlice,
  type SocketState,
} from "#wow/areas/items/sockets";
import {
  noteUseFailure,
  type SetsBehavior,
  setsBehavior,
} from "#wow/areas/items/store-sets";
import {
  proficiencyNames,
  TimerSlice,
  type TimersState,
} from "#wow/areas/items/timers";
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

export type ItemsState = {
  move: MoveState;
  read: ReadState;
  timers: TimersState;
  sockets: SocketState;
  sets: SetsState;
};

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
  private readonly sockets = new SocketSlice();
  private readonly setSlices = new SetSlice();
  private readonly setFailures: string[] = [];
  private readonly saveIcons = new Map<SaveRequest, string>();
  private readonly setApi: SetsBehavior;
  private readonly timers = new TimerSlice();
  private pending: MoveRequest | undefined;
  private last: MoveOutcome | undefined;
  private seen: InventoryClaim[] = [];

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
    this.setApi = setsBehavior({
      events: this.events,
      noteClaims: () => this.noteClaims(),
      now: () => this.deps.now(),
      releaseClaims: () => this.releaseClaims(),
      saveIcons: this.saveIcons,
      sets: this.setSlices,
      startClaims: () => this.startClaims(),
      useFailures: this.setFailures,
    });
  }

  snapshot(): ItemsState {
    return {
      move: { pending: this.pending, last: this.last },
      read: this.reads.snapshot(),
      timers: this.timers.snapshot(),
      sockets: this.sockets.snapshot(),
      sets: this.setSlices.snapshot(),
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
    if (
      !(
        this.pending ||
        this.reads.request ||
        this.sockets.request ||
        this.setSlices.snapshot().savePending ||
        this.setSlices.snapshot().usePending
      )
    )
      return;
    for (const claim of legacyClaims(this.core))
      if (claim) this.seen.push(claim);
  }
  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    if (packet.kind !== "error") return;
    const legacy = [...legacyClaims(this.core), ...this.seen];
    const move = this.pending && { itemGuid: this.pending.itemGuid };
    const read = this.reads.claim();
    const socket = this.sockets.claim();
    if (move && ownsInventoryFailure(packet, move, [...legacy, read, socket]))
      this.failMove(packet);
    else if (
      read &&
      ownsInventoryFailure(packet, read, [...legacy, move, socket])
    )
      this.failRead(inventoryResultName(packet.result), packet.result);
    else if (
      socket &&
      ownsInventoryFailure(packet, socket, [...legacy, move, read])
    )
      this.settleSocket(
        this.sockets.fail(
          "refused",
          inventoryResultName(packet.result),
          this.deps.now(),
        ),
      );
    else
      noteUseFailure(
        { sets: this.setSlices, useFailures: this.setFailures },
        packet,
      );
  }

  receiveSetList: SetsBehavior["receiveSetList"] = (...a) =>
    this.setApi.receiveSetList(...a);
  pendingSaveName: SetsBehavior["pendingSaveName"] = () =>
    this.setApi.pendingSaveName();
  beginSave: SetsBehavior["beginSave"] = (...a) => this.setApi.beginSave(...a);
  confirmSaved: SetsBehavior["confirmSaved"] = (...a) =>
    this.setApi.confirmSaved(...a);
  confirmUpdated: SetsBehavior["confirmUpdated"] = (...a) =>
    this.setApi.confirmUpdated(...a);
  expireSave: SetsBehavior["expireSave"] = () => this.setApi.expireSave();
  abandonSave: SetsBehavior["abandonSave"] = () => this.setApi.abandonSave();
  beginUse: SetsBehavior["beginUse"] = (...a) => this.setApi.beginUse(...a);
  receiveUseResult: SetsBehavior["receiveUseResult"] = (...a) =>
    this.setApi.receiveUseResult(...a);
  expireUse: SetsBehavior["expireUse"] = () => this.setApi.expireUse();
  abandonUse: SetsBehavior["abandonUse"] = () => this.setApi.abandonUse();
  beginDelete: SetsBehavior["beginDelete"] = (...a) =>
    this.setApi.beginDelete(...a);

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

  beginSocket(request: SocketRequest): void {
    this.startClaims();
    this.sockets.begin(request);
    this.noteClaims();
  }

  expireSocket(): void {
    this.settleSocket(
      this.sockets.fail("unanswered", "server_unanswered", this.deps.now()),
    );
  }
  abandonSocket(): void {
    this.sockets.abandon();
    this.releaseClaims();
  }

  receiveSocketResult(packet: SocketGemsResultPacket): void {
    const outcome = this.sockets.confirm(packet, this.deps.now());
    if (outcome) this.releaseClaims();
    this.events.emit({
      type: "sockets_updated",
      itemGuid: packet.itemGuid,
      entry: this.entryOf(packet.itemGuid),
      sockets: packet.sockets,
      bonus: packet.bonus,
    });
  }

  receiveEnchantmentLog(packet: EnchantmentLogPacket): void {
    this.events.emit({
      type: "enchantment_log",
      target: packet.target,
      caster: packet.caster,
      entry: packet.entry,
      enchantId: packet.enchantId,
      own: packet.target === this.deps.selfGuid(),
    });
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

  receiveItemCooldown(packet: ItemCooldownPacket): void {
    this.timers.cooldown(packet, this.deps.now());
    this.events.emit({
      type: "item_cooldown",
      itemGuid: packet.itemGuid,
      entry: this.entryOf(packet.itemGuid),
      spell: packet.spell,
    });
  }

  receiveItemTime(packet: ItemTimeUpdatePacket): void {
    const { expiresAt } = this.timers.time(packet, this.deps.now());
    this.events.emit({
      type: "item_timer",
      itemGuid: packet.itemGuid,
      entry: this.entryOf(packet.itemGuid),
      seconds: packet.seconds,
      expiresAt,
    });
  }

  receiveItemEnchantTime(packet: ItemEnchantTimeUpdatePacket): void {
    const { expiresAt } = this.timers.enchant(packet, this.deps.now());
    this.events.emit({
      type: "item_enchant_timer",
      itemGuid: packet.itemGuid,
      entry: this.entryOf(packet.itemGuid),
      slot: packet.slot,
      seconds: packet.seconds,
      expiresAt,
    });
  }

  receiveDeathDurability(): void {
    this.events.emit({ type: "durability_loss_death" });
  }

  receiveProficiency(packet: SetProficiencyPacket): void {
    const change = this.timers.proficiency(packet);
    if (!change) return;
    this.events.emit({
      type: "proficiency_changed",
      kind: change.kind,
      mask: packet.mask,
      added: change.added,
      names: proficiencyNames(change.kind, change.added),
    });
  }

  dispose(): void {
    this.abandon();
    this.abandonSave();
    this.abandonUse();
    this.reads.clear();
    this.sockets.clear();
    this.setSlices.clear();
    this.timers.clear();
    this.seen = [];
    this.events.clear();
  }

  private entryOf(itemGuid: bigint): number | undefined {
    return findItem(this.inventory(), itemGuid)?.item.entry;
  }

  private startClaims(): void {
    const sets = this.setSlices.snapshot();
    if (
      !(
        this.pending ||
        this.reads.request ||
        this.sockets.request ||
        sets.savePending ||
        sets.usePending
      )
    )
      this.seen = [];
  }

  private releaseClaims(): void {
    const sets = this.setSlices.snapshot();
    if (
      !(
        this.pending ||
        this.reads.request ||
        this.sockets.request ||
        sets.savePending ||
        sets.usePending
      )
    )
      this.seen = [];
  }

  private settleSocket(outcome: SocketOutcome | undefined): void {
    if (!outcome) return;
    this.releaseClaims();
    const sockHead = {
      itemGuid: outcome.request.itemGuid,
      entry: outcome.request.entry,
    };
    this.events.emit(
      outcome.status === "refused"
        ? {
            type: "socket_refused",
            reason: outcome.reason ?? "unknown",
            ...sockHead,
          }
        : { type: "socket_unanswered", ...sockHead },
    );
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
