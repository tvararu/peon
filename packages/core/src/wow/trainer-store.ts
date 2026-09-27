import { Emitter, type Unsubscribe } from "#lib/emitter";
import { type EntityLookup, fieldOf } from "#wow/entity-store";
import { readInventory } from "#wow/inventory";
import { readSelfField } from "#wow/player-state";
import {
  type TrainerBuyFailure,
  type TrainerBuyResult,
  type TrainerList,
  type TrainerOfferedSpell,
  trainerFailureName,
} from "#wow/protocol/trainer";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type {
  TrainerEvent,
  TrainerOutcome,
  TrainerRequest,
  TrainerSpellState,
  TrainerState,
} from "#wow/trainer";

export type TrainerStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
  learned: () => readonly number[];
};

export type Learner = {
  level: number | undefined;
  professionPoints: number | undefined;
  learned: readonly number[];
};

export function stateOf(
  spell: TrainerOfferedSpell,
  { level, professionPoints, learned }: Learner,
): TrainerSpellState {
  if (spell.usable === 2 || learned.includes(spell.spellId)) return "known";
  if (spell.usable === 0)
    return professionPoints !== undefined && professionPoints < spell.firstRank
      ? "no_profession_slot"
      : "available";
  return level !== undefined && level < spell.requiredLevel
    ? "too_low"
    : "unavailable";
}

export class TrainerStore {
  private readonly events = new Emitter<[TrainerEvent]>();
  private readonly deps: TrainerStoreDeps;
  private isDisposed = false;
  private list: (TrainerList & { receivedAt: number }) | undefined;
  private request: TrainerRequest | undefined;
  private lastOutcome: TrainerOutcome | undefined;

  constructor(deps: TrainerStoreDeps) {
    this.deps = deps;
  }

  onEvent(listener: (event: TrainerEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get offer(): (TrainerList & { receivedAt: number }) | undefined {
    return this.list;
  }

  get pending(): TrainerRequest | undefined {
    return this.request;
  }

  snapshot(): TrainerState {
    const learner = this.learner();
    return {
      offer: this.list && {
        ...this.list,
        spells: this.list.spells.map((spell) => ({
          ...spell,
          state: stateOf(spell, learner),
        })),
      },
      pending: this.request ? { ...this.request } : undefined,
      lastOutcome: this.lastOutcome ? { ...this.lastOutcome } : undefined,
      level: learner.level,
      coinage: this.coinage(),
    };
  }

  begin(request: TrainerRequest): TrainerState {
    this.request = request;
    return this.emit(`${request.action}_requested`);
  }

  receiveList(list: TrainerList): void {
    if (this.isDisposed) return;
    this.list = { ...list, receivedAt: this.deps.now() };
    if (this.request?.action === "list" && this.request.guid === list.guid)
      this.settle("confirmed", undefined);
    else this.emit("listed");
  }

  receiveSucceeded({ guid, spellId }: TrainerBuyResult): void {
    const pending = this.request;
    if (this.isDisposed || pending?.action !== "train") return;
    if (pending.guid !== guid || pending.spellId !== spellId) return;
    pending.succeeded = true;
    this.observe();
  }

  receiveFailed({ guid, spellId, reason }: TrainerBuyFailure): void {
    const pending = this.request;
    if (this.isDisposed || pending?.action !== "train") return;
    if (pending.guid === guid && pending.spellId === spellId)
      this.settle("refused", trainerFailureName(reason));
  }

  observe(): void {
    const pending = this.request;
    if (this.isDisposed || pending?.action !== "train" || !pending.succeeded)
      return;
    const coinage = this.coinage();
    const paid =
      pending.cost === 0 ||
      (coinage !== undefined &&
        pending.coinageBefore !== undefined &&
        pending.coinageBefore - coinage >= pending.cost);
    if (paid && this.newlyLearned(pending).length > 0)
      this.settle("confirmed", undefined);
  }

  expire(): void {
    this.settle("unanswered", "server_unanswered");
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.list = undefined;
    this.request = undefined;
    this.lastOutcome = undefined;
  }

  learner(): Learner {
    const self = this.deps.selfGuid();
    return {
      level: fieldOf(this.deps.getEntity(self), UNIT_FIELDS.LEVEL.offset),
      professionPoints: readSelfField(
        self,
        this.deps.getEntity(self),
        PLAYER_FIELDS.CHARACTER_POINTS2.offset,
      ),
      learned: this.deps.learned(),
    };
  }

  coinage(): number | undefined {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity).coinage;
  }

  private newlyLearned(request: TrainerRequest): number[] {
    if (request.action !== "train") return [];
    return this.deps
      .learned()
      .filter((id) => !request.learnedBefore.includes(id));
  }

  private settle(status: TrainerOutcome["status"], reason?: string): void {
    const request = this.request;
    if (!request) return;
    const coinageAfter = this.coinage();
    const before =
      request.action === "train" ? request.coinageBefore : coinageAfter;
    this.lastOutcome = {
      action: request.action,
      status,
      reason,
      request,
      learnedSpells: this.newlyLearned(request),
      coinageAfter,
      moneyDelta:
        coinageAfter === undefined || before === undefined
          ? undefined
          : coinageAfter - before,
      observedAt: this.deps.now(),
    };
    this.request = undefined;
    if (status === "confirmed")
      this.emit(request.action === "list" ? "listed" : "trained");
    else this.emit(status);
  }

  private emit(type: TrainerEvent["type"]): TrainerState {
    const state = this.snapshot();
    this.events.emit({ type, at: this.deps.now(), state });
    return state;
  }
}
