import { Emitter, type Unsubscribe } from "#lib/emitter";
import { type EntityLookup, fieldOf } from "#wow/entity-store";
import type { InventoryState } from "#wow/inventory";
import type { RewardsRolls } from "#wow/loot-rolls";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { InventoryChangeFailure } from "#wow/protocol/inventory";
import {
  buildAutostoreLootItem,
  buildLoot,
  buildLootRelease,
  type ItemPushResult,
  type LootItem,
  type LootMoneyNotify,
  type LootReleaseResponse,
  type RollVote,
} from "#wow/protocol/loot";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { RewardsStore } from "#wow/rewards-store";

export type RewardsDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export type RewardsOpenLoot = {
  phase: "open" | "closing";
  guid: bigint;
  lootType: number;
  money: number;
  items: LootItem[];
  openedAt: number;
  invalidatedReason: string | undefined;
};
export type RewardsLoot =
  | { phase: "closed" }
  | {
      phase: "opening";
      guid: bigint;
      requestedAt: number;
      invalidatedReason: string | undefined;
    }
  | RewardsOpenLoot;

type RequestBase = { guid: bigint; status: "unanswered"; requestedAt: number };
export type RewardsRequest = RequestBase &
  (
    | { action: "open" }
    | { action: "take"; slot: number }
    | { action: "money" }
    | { action: "close" }
  );

export type RewardsInventoryError = {
  packet: Extract<InventoryChangeFailure, { kind: "error" }>;
  inventoryFull: boolean;
  bagFull: boolean;
  observedAt: number;
};
export type RewardsLootError = {
  guid: bigint;
  error: number;
  observedAt: number;
};
export type RewardsItemPush = ItemPushResult & { observedAt: number };
export type RewardsMoneyNotice = LootMoneyNotify & { observedAt: number };
export type RewardsRelease = LootReleaseResponse & { observedAt: number };
export type RewardsOpenFailure = {
  guid: bigint;
  reason: string;
  observedAt: number;
};

export type RewardsState = {
  loot: RewardsLoot;
  pending: RewardsRequest | undefined;
  inventory: InventoryState;
  lastLootError: RewardsLootError | undefined;
  lastOpenFailure: RewardsOpenFailure | undefined;
  lastInventoryError: RewardsInventoryError | undefined;
  lastItemPush: RewardsItemPush | undefined;
  lastMoneyNotice: RewardsMoneyNotice | undefined;
  lastRelease: RewardsRelease | undefined;
  rolls: RewardsRolls;
  disposed: boolean;
};

export type RewardsEvent = {
  type:
    | "loot_open_requested"
    | "loot_opened"
    | "loot_take_requested"
    | "loot_money_requested"
    | "loot_close_requested"
    | "loot_removed"
    | "loot_money_cleared"
    | "loot_release_observed"
    | "loot_open_failed"
    | "loot_error"
    | "inventory_error"
    | "inventory_result"
    | "item_push"
    | "money_notice"
    | "inventory_observed"
    | "loot_invalidated"
    | "loot_roll_started"
    | "loot_roll_requested"
    | "loot_roll_observed"
    | "loot_roll_won"
    | "loot_roll_all_passed";
  at: number;
  state: RewardsState;
};

export const NOT_DEAD = "Loot source is not authoritatively dead";
export const NOT_LOOTABLE = "Creature has no observed lootable flag";
export const RELEASE_ONLY_MS = 3000;

export class RewardsRuntime {
  private readonly events = new Emitter<[RewardsEvent]>();
  private readonly store: RewardsStore;
  private readonly deps: RewardsDeps;
  private disposed = false;
  private releaseOnlyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(store: RewardsStore, deps: RewardsDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((event) => {
      this.retime(event);
      this.events.emit(event);
      if (event.type === "loot_removed" || event.type === "loot_money_cleared")
        this.releaseIfEmpty();
    });
  }

  onEvent(listener: (event: RewardsEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    this.store.resetInventoryBaseline();
    return this.events.subscribe(listener);
  }

  snapshot(): RewardsState {
    return this.store.snapshot();
  }

  open(guid: bigint): RewardsState {
    this.active();
    this.alive();
    if (this.store.loot.phase !== "closed")
      throw new Error("Previous loot window has not closed");
    const source = this.deps.getEntity(guid);
    if (source?.guid !== guid)
      throw new Error("Loot source is not an observed entity");
    if (source.objectType === ObjectType.GAMEOBJECT)
      return this.store.requestOpen(guid);
    if (source.objectType !== ObjectType.UNIT)
      throw new Error("Loot source is not an observed creature");
    const health = fieldOf(source, UNIT_FIELDS.HEALTH.offset);
    const flags = source.rawFields.get(UNIT_FIELDS.DYNAMIC_FLAGS.offset);
    if (health !== 0) throw new Error(NOT_DEAD);
    if (flags === undefined || !(flags & 1)) throw new Error(NOT_LOOTABLE);
    this.deps.send(GameOpcode.CMSG_LOOT, buildLoot(guid));
    return this.store.requestOpen(guid);
  }

  abandonOpen(): RewardsState {
    this.store.failOpen("abandoned");
    return this.store.snapshot();
  }

  take(slot: number): RewardsState {
    const window = this.actionWindow();
    const item = window.items.find((offered) => offered.slot === slot);
    if (!item) throw new Error("Loot slot was not offered");
    if (item.slotType !== 0 && item.slotType !== 4)
      throw new Error("Loot slot is not available for direct pickup");
    this.deps.send(
      GameOpcode.CMSG_AUTOSTORE_LOOT_ITEM,
      buildAutostoreLootItem(slot),
    );
    return this.store.requestTake(window.guid, slot);
  }

  takeMoney(): RewardsState {
    const window = this.actionWindow();
    if (window.money === 0) throw new Error("Loot window has no offered money");
    this.deps.send(GameOpcode.CMSG_LOOT_MONEY);
    return this.store.requestMoney(window.guid);
  }

  close(): RewardsState {
    this.active();
    const { loot } = this.store;
    if (loot.phase === "closed" || loot.phase === "closing")
      return this.store.snapshot();
    if (loot.phase !== "open") throw new Error("No open loot window to close");
    return this.release(loot);
  }

  roll(target: bigint, slot: number, choice: RollVote): void {
    this.store.rolls.roll(this.deps.send, target, slot, choice);
  }

  dispose(): void {
    this.disposed = true;
    this.events.clear();
    this.stopReleaseOnlyTimer();
  }

  private retime({ type, state }: RewardsEvent): void {
    if (
      type === "loot_error" ||
      type === "loot_opened" ||
      type === "loot_open_failed"
    )
      this.stopReleaseOnlyTimer();
    else if (type === "loot_release_observed" && state.loot.phase === "opening")
      this.startReleaseOnlyTimer(state.loot.guid);
  }

  private active(): void {
    if (this.disposed || this.store.disposed)
      throw new Error("Rewards runtime disposed");
    if (!this.deps.selfGuid())
      throw new Error("Authenticated player GUID is unknown");
  }

  private alive(): void {
    if (!this.store.selfAlive())
      throw new Error("Loot action requires authoritative alive state");
  }

  private actionWindow(): RewardsOpenLoot {
    this.active();
    this.alive();
    const { loot } = this.store;
    if (loot.phase !== "open")
      throw new Error("No open server-observed loot window");
    if (loot.invalidatedReason)
      throw new Error(`Loot window is invalid: ${loot.invalidatedReason}`);
    if (this.store.pending)
      throw new Error("Previous loot request remains unanswered");
    return loot;
  }

  private startReleaseOnlyTimer(guid: bigint): void {
    if (this.releaseOnlyTimer) return;
    this.releaseOnlyTimer = setTimeout(() => {
      this.releaseOnlyTimer = undefined;
      const { loot } = this.store;
      if (loot.phase === "opening" && loot.guid === guid)
        this.store.failOpen("release_only");
    }, RELEASE_ONLY_MS);
  }

  private stopReleaseOnlyTimer(): void {
    clearTimeout(this.releaseOnlyTimer);
    this.releaseOnlyTimer = undefined;
  }

  private release(window: RewardsOpenLoot): RewardsState {
    this.deps.send(GameOpcode.CMSG_LOOT_RELEASE, buildLootRelease(window.guid));
    return this.store.requestClose(window);
  }

  private releaseIfEmpty(): void {
    const { loot } = this.store;
    if (loot.phase !== "open" || this.store.pending) return;
    if (loot.items.length > 0 || loot.money > 0) return;
    this.release(loot);
  }
}
