import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { Entity, EntityLookup } from "#wow/entity-store";
import { readInventory } from "#wow/inventory";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { InventoryChangeFailure } from "#wow/protocol/inventory";
import type { ItemPushResult } from "#wow/protocol/loot";
import type { QuestQueryResponse } from "#wow/protocol/quest-query";
import type {
  QuestgiverQuestComplete,
  QuestgiverStatus,
} from "#wow/protocol/questgiver";
import { inventoryQuestError, type QuestError } from "#wow/quest-errors";
import {
  itemObjectives,
  type QuestItemObjective,
  type QuestItemPush,
  settleItemPushes,
} from "#wow/quest-items";
import { QuestQueries } from "#wow/quest-queries";
import {
  type QuestLog,
  questLogChanges,
  readQuestLog,
  sameSlot,
} from "#wow/quest-slots";
import type {
  QuestEvent,
  QuestProgress,
  QuestProgressUpdate,
  QuestState,
} from "#wow/quests";
import {
  expectedDialog,
  QUEST_REPLY_TIMEOUT_MS,
  type QuestAction,
  type QuestDialog,
  type QuestIntent,
  type QuestUnresolvedReason,
  type QuestWindow,
  questIdsVisible,
  repliesAtOnce,
} from "#wow/quests-requests";

export type QuestStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export type QuestChange = Omit<QuestEvent, "state">;

export class QuestStore {
  private readonly events = new Emitter<[QuestChange]>();
  private readonly logObserved = new Emitter<[]>();
  private isDisposed = false;
  private shown: QuestDialog | undefined;
  private giver: bigint | undefined;
  private log: QuestLog;
  private logEntity: Entity | undefined;
  private readonly visibleQuestIds = new WeakMap<Entity, boolean>();
  private readonly queries: QuestQueries;
  private lastIntent: QuestIntent | undefined;
  private unresolved: QuestState["unresolved"] = [];
  private waiting: QuestState["pending"];
  private lastError: QuestError | undefined;
  private lastProgress: QuestProgress | undefined;
  private itemPushes: QuestItemPush[] = [];
  private lastReward: QuestState["lastReward"];
  private lastStatus: QuestgiverStatus | undefined;
  private readonly deps: QuestStoreDeps;

  constructor(deps: QuestStoreDeps) {
    this.deps = deps;
    this.queries = new QuestQueries(deps.now);
    this.log = readQuestLog(deps.selfGuid(), deps.getEntity);
    this.logEntity = deps.getEntity(deps.selfGuid());
  }

  onEvent(listener: (change: QuestChange) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  onLogObserved(listener: () => void): Unsubscribe {
    return this.logObserved.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get dialog(): QuestDialog | undefined {
    return this.shown;
  }

  get pending(): QuestState["pending"] {
    return this.waiting;
  }

  snapshot(): QuestState {
    this.expire();
    return this.state();
  }

  state(): QuestState {
    return structuredClone({
      dialog: this.shown,
      giver: this.giver,
      log: this.log,
      queries: [...this.queries.entries.values()],
      lastIntent: this.lastIntent,
      pending: this.waiting,
      unresolved: this.unresolved,
      lastError: this.lastError,
      lastProgress: this.lastProgress,
      items: this.itemObjectives(),
      itemPushes: this.itemPushes,
      lastReward: this.lastReward,
      lastStatus: this.lastStatus,
    });
  }

  requestQuery(questId: number): void {
    this.queries.record(questId);
    this.emit("query", "request", questId);
  }

  recordQuery(questId: number): void {
    this.queries.record(questId);
  }

  unqueriedLogIds(): number[] {
    return this.queries.missing(this.log);
  }

  requestIntent(intent: Omit<QuestIntent, "at">): void {
    this.lastIntent = { ...intent, at: this.deps.now() };
    this.waiting = { ...this.lastIntent, status: "unanswered" };
    if (intent.action !== "abandon") {
      this.shown = undefined;
      this.giver = intent.guid;
    }
    this.lastError = undefined;
    this.emit("intent", "request", intent.questId);
  }

  requestCancel(): void {
    this.leaveUnresolved("cancelled");
    this.shown = undefined;
    this.lastIntent = {
      action: "cancel",
      at: this.deps.now(),
      guid: this.giver,
    };
    this.waiting = { ...this.lastIntent, status: "unanswered" };
    this.emit("intent", "request");
  }

  observeSelfCreate(entity: Entity): void {
    if (
      this.isDisposed ||
      entity.guid !== this.deps.selfGuid() ||
      entity.objectType !== ObjectType.PLAYER ||
      !entity.createComplete
    )
      return;
    if (this.visibleQuestIds.has(entity)) return;
    this.resetInteraction();
    this.visibleQuestIds.set(entity, questIdsVisible(entity));
  }

  observeQuestLog(): void {
    if (this.isDisposed) return;
    const next = this.readLog();
    const entity = this.deps.getEntity(this.deps.selfGuid());
    const previous = this.log;
    const sameEntity = entity === this.logEntity;
    this.log = next;
    this.logEntity = entity;
    this.settleItems();
    const unchanged =
      sameEntity &&
      previous.slots.every((slot, i) => {
        const nextSlot = next.slots[i];
        if (nextSlot === undefined)
          throw new Error("quest slots length mismatch");
        return sameSlot(slot, nextSlot);
      });
    if (!unchanged) {
      if (sameEntity) this.transitions(previous, next);
      this.emit("log", "quest_log");
    }
    this.logObserved.emit();
  }

  resetInteraction(): void {
    if (this.isDisposed) return;
    const open =
      this.shown !== undefined ||
      this.giver !== undefined ||
      this.waiting !== undefined;
    this.leaveUnresolved("reset");
    this.shown = undefined;
    this.giver = undefined;
    this.waiting = undefined;
    if (open) this.emit("closed", "lifecycle");
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.logObserved.clear();
    this.shown = undefined;
    this.giver = undefined;
    this.waiting = undefined;
    this.unresolved = [];
    this.itemPushes = [];
    this.queries.entries.clear();
  }

  readLog(): QuestLog {
    const entity = this.deps.getEntity(this.deps.selfGuid());
    return readQuestLog(
      this.deps.selfGuid(),
      this.deps.getEntity,
      entity !== undefined && this.visibleQuestIds.get(entity) === true,
    );
  }

  expire(): void {
    const pending = this.waiting;
    if (
      this.isDisposed ||
      !pending ||
      this.deps.now() - pending.at < QUEST_REPLY_TIMEOUT_MS
    )
      return;
    this.leaveUnresolved("no_reply");
    this.waiting = undefined;
    if (pending.action !== "abandon") {
      this.shown = undefined;
      this.giver = undefined;
    }
    this.emit("expired", "lifecycle", pending.questId, "no_reply");
  }

  receiveWindow(guid: bigint, window: QuestWindow): void {
    if (this.isDisposed) return;
    this.expire();
    if (this.giver !== guid) return;
    const answered =
      this.waiting?.action === "talk" ||
      this.waiting?.action === "selectOption";
    if (answered) this.answer();
    this.shown = undefined;
    this.giver = undefined;
    if (window === "trainer" || window === "vendor") {
      this.emit("window", "packet", undefined, window);
      return;
    }
    this.lastError = {
      kind: "unsupported_window",
      at: this.deps.now(),
      window,
      guid,
    };
    this.emit("window", "packet", undefined, `unsupported_window:${window}`);
  }

  openDialog(dialog: QuestDialog): void {
    if (this.isDisposed) return;
    this.expire();
    const expected = this.waiting;
    const wrongQuest =
      expected?.questId !== undefined &&
      "questId" in dialog.data &&
      dialog.data.questId !== expected.questId;
    if (
      dialog.data.guid !== this.giver ||
      wrongQuest ||
      !expectedDialog(this.waiting?.action, dialog)
    ) {
      this.lastError = { kind: "stale_dialog", at: this.deps.now() };
      this.emit("error", "packet");
      return;
    }
    this.shown = dialog;
    if (expected) this.answer();
    this.emit(
      "dialog",
      "packet",
      "questId" in dialog.data ? dialog.data.questId : undefined,
    );
  }

  closeDialog(): void {
    if (this.isDisposed) return;
    this.shown = undefined;
    this.giver = undefined;
    if (this.waiting?.action === "cancel") this.answer();
    else if (this.waiting?.action !== "abandon") {
      this.leaveUnresolved("closed");
      this.waiting = undefined;
    }
    this.emit("closed", "packet");
  }

  receiveQuery(data: QuestQueryResponse): void {
    if (this.isDisposed) return;
    this.queries.receive(data);
    this.emit("query", "packet", data.questId);
  }

  receiveReward(data: QuestgiverQuestComplete): void {
    if (this.isDisposed) return;
    this.lastReward = { ...data, at: this.deps.now() };
    this.resolve("chooseReward", data.questId);
    this.emit("rewarded", "packet", data.questId);
  }

  receiveStatus(data: QuestgiverStatus): void {
    if (this.isDisposed) return;
    this.lastStatus = data;
    this.emit("status", "packet");
  }

  receiveProgress(progress: QuestProgressUpdate): void {
    if (this.isDisposed) return;
    this.lastProgress = { ...progress, at: this.deps.now() };
    let questId: number | undefined;
    if (progress.kind === "kill") questId = progress.data.questId;
    if (progress.kind === "complete") questId = progress.questId;
    this.emit(
      progress.kind === "complete" ? "completed" : "progress",
      "packet",
      questId,
    );
  }

  receiveItemPush(push: ItemPushResult): void {
    if (this.isDisposed || push.guid !== this.deps.selfGuid()) return;
    if (!this.itemObjectives().some((o) => o.itemId === push.itemId)) return;
    this.itemPushes.push({ ...push, at: this.deps.now() });
    this.settleItems();
  }

  receiveError(error: Omit<QuestError, "at">): void {
    if (this.isDisposed) return;
    this.lastError = { ...error, at: this.deps.now() };
    if (
      this.waiting?.action !== "cancel" &&
      (error.questId === undefined || error.questId === this.waiting?.questId)
    ) {
      if (this.waiting) this.answer();
      this.shown = undefined;
    }
    this.emit("error", "packet", error.questId);
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    const error = inventoryQuestError(this.waiting, packet);
    if (this.isDisposed || !error) return;
    this.lastError = { ...error, at: this.deps.now() };
    this.emit("error", "packet", error.questId);
  }

  private itemObjectives(): QuestItemObjective[] {
    return itemObjectives(
      this.log,
      this.queries.entries,
      readInventory(this.deps.selfGuid(), this.deps.getEntity),
    );
  }

  private settleItems(): void {
    if (this.itemPushes.length === 0) return;
    const { settled, waiting } = settleItemPushes(
      this.itemPushes,
      this.itemObjectives(),
    );
    this.itemPushes = waiting;
    for (const collect of settled) {
      this.lastProgress = { ...collect, at: this.deps.now() };
      this.emit("progress", "inventory", collect.questId);
    }
  }

  private emit(
    type: QuestEvent["type"],
    source: QuestEvent["source"],
    questId?: number,
    detail?: string,
  ): void {
    this.events.emit({ type, source, questId, detail });
  }

  private leaveUnresolved(reason: QuestUnresolvedReason): void {
    if (!this.waiting || this.waiting.action === "cancel") return;
    const { status: _status, ...intent } = this.waiting;
    this.unresolved.push({ ...intent, reason });
  }

  private resolve(action: QuestAction, questId: number): void {
    if (this.waiting?.action === action && this.waiting.questId === questId)
      this.answer();
    this.unresolved = this.unresolved.filter(
      (intent) => intent.action !== action || intent.questId !== questId,
    );
  }

  private answer(): void {
    this.waiting = undefined;
    this.unresolved = this.unresolved.filter((i) => !repliesAtOnce(i.action));
  }

  private transitions(previous: QuestLog, next: QuestLog): void {
    for (const { type, questId } of questLogChanges(previous, next)) {
      if (type === "accepted") this.resolve("accept", questId);
      if (type === "removed") this.resolve("abandon", questId);
      this.emit(type, "quest_log", questId);
    }
  }
}
