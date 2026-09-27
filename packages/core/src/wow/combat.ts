import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { CombatChange, CombatStore } from "#wow/combat-store";
import type {
  CombatEvent,
  CombatItem,
  CombatState,
  CombatUnit,
} from "#wow/combat-types";
import { combatUnitOf } from "#wow/combat-unit";
import type { ControlPose } from "#wow/control";
import { type EntityLookup, isUnit } from "#wow/entity-store";
import type {
  CombatPose,
  MotionStore,
  ObservedPosition,
} from "#wow/motion-store";
import { buildAttackSwing } from "#wow/protocol/combat";
import { GameOpcode } from "#wow/protocol/opcodes";
import { buildPetAttack } from "#wow/protocol/pet";
import type { SpellCatalog, SpellDefinition } from "#wow/spell-catalog";

export type {
  CombatCast,
  CombatEvent,
  CombatEventType,
  CombatItem,
  CombatOutcome,
  CombatPetCommand,
  CombatState,
  CombatUnit,
  CombatXp,
} from "#wow/combat-types";

export type CombatDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  selectedGuid: () => bigint | undefined;
  getEntity: EntityLookup;
  selfPose: () => ControlPose | undefined;
  selfServerPose?: () => ControlPose | undefined;
};

export class CombatRuntime {
  private readonly deps: CombatDeps;
  private readonly store: CombatStore;
  private readonly motions: MotionStore;
  private readonly events = new Emitter<[CombatEvent]>();

  constructor(
    stores: { combat: CombatStore; motion: MotionStore },
    deps: CombatDeps,
  ) {
    this.deps = deps;
    this.store = stores.combat;
    this.motions = stores.motion;
    this.store.onChange((change) => this.emit(change));
  }

  onEvent(listener: (event: CombatEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  isAttackingSelf(guid: bigint): boolean {
    return this.store.isAttackingSelf(guid);
  }

  attackers(): bigint[] {
    return this.store.attackers();
  }

  snapshot(selected = this.deps.selectedGuid()): CombatState {
    return {
      self: this.unitOf(this.deps.selfGuid(), this.deps.selfPose()),
      target: selected
        ? this.unitOf(selected, this.motions.pose(selected))
        : undefined,
      selectedGuid: selected,
      ...this.store.record(selected),
    };
  }

  unit(guid: bigint): CombatUnit | undefined {
    const entity = this.deps.getEntity(guid);
    if (!isUnit(entity)) return undefined;
    const pose =
      guid === this.deps.selfGuid()
        ? this.deps.selfPose()
        : this.motions.pose(guid);
    return this.unitOf(guid, pose, entity);
  }

  setCatalog(catalog: SpellCatalog): void {
    this.store.setCatalog(catalog);
  }

  definition(id: number): SpellDefinition | undefined {
    return this.store.definition(id);
  }

  readyAt(id: number): number {
    return this.store.readyAt(id);
  }

  spellbook(): SpellDefinition[] {
    return this.store.spellbook();
  }

  cast(spellId: number, targetGuid: bigint): void {
    const { send } = this.deps;
    this.store.sent(
      this.store.repeats(spellId)
        ? this.store.autoRepeat.send(send, spellId, targetGuid)
        : this.store.casts.send(send, spellId, targetGuid),
      "cast_sent",
    );
  }

  useItem(spellId: number, item: CombatItem): void {
    this.store.sent(
      this.store.casts.sendItem(this.deps.send, spellId, item),
      "cast_sent",
    );
  }

  attack(targetGuid: bigint): void {
    if (targetGuid <= 0n || targetGuid > 0xffffffffffffffffn)
      throw new Error("invalid_guid");
    this.deps.send(GameOpcode.CMSG_ATTACKSWING, buildAttackSwing(targetGuid));
    this.store.attackSent(targetGuid);
  }

  petAttack(pet: bigint, target: bigint): void {
    this.deps.send(GameOpcode.CMSG_PET_ACTION, buildPetAttack(pet, target));
    this.store.petCommanded(pet, target);
  }

  cancelCast(): void {
    this.store.sent(this.store.casts.cancel(this.deps.send), "outcome");
  }

  stopAttack(): void {
    this.deps.send(GameOpcode.CMSG_ATTACKSTOP);
    this.store.attackSent(undefined);
  }

  stopAutoRepeat(): void {
    const outcome = this.store.autoRepeat.stop(this.deps.send);
    if (outcome) this.store.sent(outcome, "outcome", "auto_repeat_stopped");
  }

  interruptCast(): void {
    if (this.store.casts.hasUncancelled()) this.cancelCast();
  }

  halt(): void {
    this.interruptCast();
    this.stopAutoRepeat();
    if (this.store.attacking || this.store.attackPending) this.stopAttack();
  }

  dispose(): void {
    this.events.clear();
  }

  observedPosition(guid: bigint): ObservedPosition | undefined {
    return this.motions.observation(guid);
  }

  private unitOf(
    guid: bigint,
    pose: CombatPose | undefined,
    entity = this.deps.getEntity(guid),
  ): CombatUnit {
    return combatUnitOf(
      { deps: this.deps, motions: this.motions },
      guid,
      pose,
      entity,
    );
  }

  private emit({ type, reason, attacker }: CombatChange): void {
    const event: CombatEvent = { type, state: this.snapshot() };
    if (reason !== undefined) event.reason = reason;
    if (attacker !== undefined) event.attacker = attacker;
    const spellId = event.state.lastOutcome?.spellId;
    const spellName =
      type.startsWith("cast_") && spellId !== undefined
        ? this.store.definition(spellId)?.name
        : undefined;
    if (spellName !== undefined) event.spellName = spellName;
    this.events.emit(event);
  }
}
