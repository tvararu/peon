import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { EntityLookup } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type {
  QuestUpdateAddItem,
  QuestUpdateAddKill,
} from "#wow/protocol/quest-log";
import { buildQuestQuery } from "#wow/protocol/quest-query";
import type {
  QuestgiverQuestComplete,
  QuestgiverStatus,
} from "#wow/protocol/questgiver";
import type { QuestError } from "#wow/quest-errors";
import type {
  QuestCollect,
  QuestItemObjective,
  QuestItemPush,
} from "#wow/quest-items";
import type { QuestQuery } from "#wow/quest-queries";
import type { QuestLog } from "#wow/quest-slots";
import type { QuestStore } from "#wow/quest-store";
import {
  abandonRequest,
  acceptRequest,
  chooseRewardRequest,
  completeRequest,
  positiveId,
  QUEST_REPLY_TIMEOUT_MS,
  type QuestDialog,
  type QuestIntent,
  type QuestRequest,
  type QuestUnresolvedReason,
  requestRewardRequest,
  selectOptionRequest,
  selectQuestRequest,
  talkRequest,
  unansweredError,
} from "#wow/quests-requests";

export type QuestProgressUpdate =
  | { kind: "kill"; data: QuestUpdateAddKill }
  | { kind: "item"; data: QuestUpdateAddItem }
  | { kind: "complete"; questId: number };

export type QuestProgress = (QuestProgressUpdate | QuestCollect) & {
  at: number;
};

export type QuestState = {
  dialog: QuestDialog | undefined;
  giver: bigint | undefined;
  log: QuestLog;
  queries: QuestQuery[];
  lastIntent: QuestIntent | undefined;
  unresolved: (QuestIntent & { reason: QuestUnresolvedReason })[];
  pending: (QuestIntent & { status: "unanswered" }) | undefined;
  lastError: QuestError | undefined;
  lastProgress: QuestProgress | undefined;
  items: QuestItemObjective[];
  itemPushes: QuestItemPush[];
  lastReward: (QuestgiverQuestComplete & { at: number }) | undefined;
  lastStatus: QuestgiverStatus | undefined;
};

export type QuestEvent = {
  type:
    | "intent"
    | "dialog"
    | "closed"
    | "query"
    | "log"
    | "accepted"
    | "progress"
    | "completed"
    | "failed"
    | "removed"
    | "rewarded"
    | "status"
    | "error"
    | "expired"
    | "window";
  source: "request" | "packet" | "quest_log" | "inventory" | "lifecycle";
  state: QuestState;
  questId?: number;
  detail?: string;
};

export type QuestDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export class QuestRuntime {
  private readonly events = new Emitter<[QuestEvent]>();
  private readonly store: QuestStore;
  private readonly deps: QuestDeps;
  private disposed = false;
  private expiry: ReturnType<typeof setTimeout> | undefined;

  constructor(store: QuestStore, deps: QuestDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((change) => {
      if (this.events.size > 0)
        this.events.emit({ ...change, state: store.state() });
    });
    store.onLogObserved(() => this.queryLogged());
  }

  onEvent(listener: (event: QuestEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  snapshot(): QuestState {
    return this.store.snapshot();
  }

  talk(guid: bigint): void {
    this.active();
    this.send(talkRequest(guid));
  }

  query(questId: number): void {
    this.active();
    positiveId(questId);
    this.deps.send(GameOpcode.CMSG_QUEST_QUERY, buildQuestQuery(questId));
    this.store.requestQuery(questId);
  }

  selectOption(optionId: number, code?: string): void {
    this.active();
    this.send(selectOptionRequest(this.store.dialog, optionId, code));
  }

  selectQuest(questId: number): void {
    this.active();
    const request = selectQuestRequest(this.store.dialog, questId);
    if (request === "turnIn") {
      this.complete(questId);
      return;
    }
    this.send(request);
  }

  accept(): void {
    this.active();
    this.send(acceptRequest(this.store.dialog, this.store.readLog()));
  }

  complete(questId: number): void {
    this.active();
    this.send(completeRequest(this.store.dialog, questId));
  }

  requestReward(): void {
    this.active();
    this.send(requestRewardRequest(this.store.dialog));
  }

  chooseReward(index: number): void {
    this.active();
    this.send(chooseRewardRequest(this.store.dialog, index));
  }

  abandon(slot: number): void {
    this.active();
    this.send(abandonRequest(slot, () => this.store.readLog()));
  }

  cancel(): void {
    this.active();
    if (this.store.pending?.action === "cancel")
      throw new Error(
        `quest_cancel_unanswered: waiting for the server to close the dialog; it expires as no_reply after ${QUEST_REPLY_TIMEOUT_MS / 1000}s`,
      );
    this.deps.send(GameOpcode.CMSG_QUESTGIVER_CANCEL);
    this.arm();
    this.store.requestCancel();
  }

  dispose(): void {
    this.disposed = true;
    this.events.clear();
    clearTimeout(this.expiry);
  }

  private queryLogged(): void {
    if (this.disposed) return;
    for (const questId of this.store.unqueriedLogIds()) {
      this.deps.send(GameOpcode.CMSG_QUEST_QUERY, buildQuestQuery(questId));
      this.store.recordQuery(questId);
    }
  }

  private active(): void {
    if (this.disposed || this.store.disposed)
      throw new Error("quests_disposed");
    this.store.expire();
  }

  private arm(): void {
    clearTimeout(this.expiry);
    this.expiry = setTimeout(
      () => this.store.expire(),
      QUEST_REPLY_TIMEOUT_MS + 25,
    );
    this.expiry.unref?.();
  }

  private send({ opcode, body, intent }: QuestRequest): void {
    const { pending } = this.store;
    if (pending) throw unansweredError(pending, this.deps.now());
    this.deps.send(opcode, body);
    this.arm();
    this.store.requestIntent(intent);
  }
}
