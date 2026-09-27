import { Emitter, type Unsubscribe } from "#lib/emitter";
import { type EntityLookup, isUnit } from "#wow/entity-store";
import { readLife } from "#wow/player-state";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  buildTrainerBuySpell,
  buildTrainerList,
  type TrainerList,
  type TrainerOfferedSpell,
} from "#wow/protocol/trainer";
import { stateOf, type TrainerStore } from "#wow/trainer-store";

export type TrainerDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
  learned: () => readonly number[];
};

export const TRAINER_ANSWER_MS = 5000;
const NPC_FLAG_TRAINER = 0x10;

export type TrainerSpellState =
  | "available"
  | "too_low"
  | "no_profession_slot"
  | "unavailable"
  | "known";
export type TrainerSpell = TrainerOfferedSpell & { state: TrainerSpellState };
export type TrainerOffer = Omit<TrainerList, "spells"> & {
  spells: TrainerSpell[];
  receivedAt: number;
};

export type TrainerRequest =
  | { action: "list"; guid: bigint; requestedAt: number }
  | {
      action: "train";
      guid: bigint;
      spellId: number;
      cost: number;
      coinageBefore: number | undefined;
      learnedBefore: number[];
      succeeded: boolean;
      requestedAt: number;
    };

export type TrainerOutcome = {
  action: TrainerRequest["action"];
  status: "confirmed" | "refused" | "unanswered";
  reason: string | undefined;
  request: TrainerRequest;
  learnedSpells: number[];
  coinageAfter: number | undefined;
  moneyDelta: number | undefined;
  observedAt: number;
};

export type TrainerState = {
  offer: TrainerOffer | undefined;
  pending: TrainerRequest | undefined;
  lastOutcome: TrainerOutcome | undefined;
  level: number | undefined;
  coinage: number | undefined;
};

export type TrainerEvent = {
  type:
    | "list_requested"
    | "listed"
    | "train_requested"
    | "trained"
    | "refused"
    | "unanswered";
  at: number;
  state: TrainerState;
};

export class TrainerRuntime {
  private readonly events = new Emitter<[TrainerEvent]>();
  private readonly store: TrainerStore;
  private readonly deps: TrainerDeps;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(store: TrainerStore, deps: TrainerDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((event) => {
      this.react(event);
      this.events.emit(event);
    });
  }

  onEvent(listener: (event: TrainerEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  snapshot(): TrainerState {
    return this.store.snapshot();
  }

  list(guid: bigint): TrainerState {
    this.ready();
    const trainer = this.deps.getEntity(guid);
    if (!(isUnit(trainer) && trainer.npcFlags & NPC_FLAG_TRAINER))
      throw new Error("Creature is not an observed trainer");
    this.deps.send(GameOpcode.CMSG_TRAINER_LIST, buildTrainerList(guid));
    return this.store.begin({
      action: "list",
      guid,
      requestedAt: this.deps.now(),
    });
  }

  train(spellId: number): TrainerState {
    this.ready();
    const { offer } = this.store;
    if (!offer) throw new Error("No listed trainer");
    const spell = offer.spells.find((s) => s.spellId === spellId);
    if (!spell) throw new Error("Spell is not offered by this trainer");
    const state = stateOf(spell, this.store.learner());
    if (state !== "available") throw new Error(`Spell is ${state}`);
    this.deps.send(
      GameOpcode.CMSG_TRAINER_BUY_SPELL,
      buildTrainerBuySpell(offer.guid, spellId),
    );
    return this.store.begin({
      action: "train",
      guid: offer.guid,
      spellId,
      cost: spell.cost,
      coinageBefore: this.store.coinage(),
      learnedBefore: [...this.deps.learned()],
      succeeded: false,
      requestedAt: this.deps.now(),
    });
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.events.clear();
  }

  private react(event: TrainerEvent): void {
    if (event.type.endsWith("_requested")) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.store.expire(), TRAINER_ANSWER_MS);
    } else if (!event.state.pending) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private ready(): void {
    if (this.disposed || this.store.disposed)
      throw new Error("Trainer runtime disposed");
    const self = this.deps.selfGuid();
    if (!self) throw new Error("Authenticated player GUID is unknown");
    if (readLife(self, this.deps.getEntity).life !== "alive")
      throw new Error("Training requires authoritative alive state");
    if (this.store.pending)
      throw new Error("Previous trainer request remains unanswered");
  }
}
