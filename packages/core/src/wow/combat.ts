import { Emitter, type Unsubscribe } from "#lib/emitter";
import { AuraStore } from "#wow/aura-store";
import { AutoRepeatTracker } from "#wow/combat-auto-repeat";
import { CombatCasts } from "#wow/combat-casts";
import type {
  CombatEvent,
  CombatEventType,
  CombatItem,
  CombatOutcome,
  CombatState,
  CombatUnit,
  CombatXp,
} from "#wow/combat-types";
import { combatUnitOf } from "#wow/combat-unit";
import type { ControlPose } from "#wow/control";
import { CooldownStore } from "#wow/cooldown-store";
import { type EntityLookup, isUnit, type Position } from "#wow/entity-store";
import {
  type CombatPose,
  MotionStore,
  type ObservedPosition,
  type PositionSource,
} from "#wow/motion-store";
import type { AuraUpdate, AuraUpdateAll } from "#wow/protocol/aura";
import {
  type AttackStart,
  type AttackStop,
  type AttackSwingError,
  buildAttackSwing,
  type CancelAutoRepeat,
  type XpGain,
} from "#wow/protocol/combat";
import type { LevelUpInfo } from "#wow/protocol/experience";
import type { InventoryChangeFailure } from "#wow/protocol/inventory";
import type { CreateSpline, MonsterMove } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type {
  CastFailed,
  CooldownNotice,
  InitialSpells,
  LearnedSpell,
  RemovedSpell,
  SpellCooldown,
  SpellDelayed,
  SpellFailure,
  SpellGo,
  SpellStart,
  SupersededSpell,
} from "#wow/protocol/spell";
import type { SpellCatalog, SpellDefinition } from "#wow/spell-catalog";

export type {
  CombatCast,
  CombatEvent,
  CombatEventType,
  CombatItem,
  CombatOutcome,
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
  catalog?: SpellCatalog;
};

export class CombatRuntime {
  private readonly deps: CombatDeps;
  private readonly events = new Emitter<[CombatEvent]>();
  private readonly incomingAttackers = new Set<bigint>();
  private readonly learned = new Set<number>();
  private readonly cooldowns: CooldownStore;
  private readonly auras: AuraStore;
  private readonly motions: MotionStore;
  private readonly casts: CombatCasts;
  private readonly autoRepeat: AutoRepeatTracker;
  private pendingAttack: bigint | undefined;
  private attacking = false;
  private attackTarget: bigint | undefined;
  private lastOutcome: CombatOutcome | undefined;
  private lastXp: CombatXp | undefined;
  private lastLevelUp: CombatState["lastLevelUp"];

  constructor(deps: CombatDeps) {
    this.deps = deps;
    this.cooldowns = new CooldownStore(
      deps.now,
      (id) => this.definition(id)?.cooldown,
    );
    this.auras = new AuraStore(deps.now, (id) => this.definition(id)?.name);
    this.motions = new MotionStore(deps.now);
    this.casts = new CombatCasts({
      send: deps.send,
      now: deps.now,
      learned: this.learned,
      cooldowns: this.cooldowns,
    });
    this.autoRepeat = new AutoRepeatTracker({ ...deps, casts: this.casts });
  }

  onEvent(listener: (event: CombatEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  isAttackingSelf(guid: bigint): boolean {
    if (!this.incomingAttackers.has(guid)) return false;
    const entity = this.deps.getEntity(guid);
    return !(isUnit(entity) && entity.health === 0);
  }

  attackers(): bigint[] {
    return [...this.incomingAttackers].filter((guid) =>
      this.isAttackingSelf(guid),
    );
  }

  snapshot(selected = this.deps.selectedGuid()): CombatState {
    const selfGuid = this.deps.selfGuid();
    return {
      self: this.unitOf(selfGuid, this.deps.selfPose()),
      target: selected
        ? this.unitOf(selected, this.motions.pose(selected))
        : undefined,
      selectedGuid: selected,
      attacking: this.attacking,
      pendingAttack: this.pendingAttack,
      attackTarget: this.attackTarget,
      casting: this.casts.casting ? { ...this.casts.casting } : undefined,
      pendingCast: this.casts.pending ? { ...this.casts.pending } : undefined,
      autoRepeat: this.autoRepeat.state,
      learned: [...this.learned],
      unknownLearned: [...this.learned].filter(
        (id) => !this.deps.catalog?.get(id),
      ),
      cooldowns: this.cooldowns.list(this.learned),
      auras: this.auras.forUnit(selfGuid),
      targetAuras: selected ? this.auras.forUnit(selected) : [],
      lastOutcome: this.lastOutcome,
      lastXp: this.lastXp,
      lastLevelUp: this.lastLevelUp,
      attackers: this.attackers(),
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
    this.deps.catalog = catalog;
  }

  definition(id: number): SpellDefinition | undefined {
    return this.deps.catalog?.get(id);
  }

  readyAt(id: number): number {
    return this.cooldowns.readyAt(id);
  }

  spellbook(): SpellDefinition[] {
    const catalog = this.deps.catalog;
    if (!catalog) throw new Error("missing_spell_data");
    const defs: SpellDefinition[] = [];
    for (const id of this.learned) {
      const def = catalog.get(id);
      if (def) defs.push(def);
    }
    return defs;
  }

  cast(spellId: number, targetGuid: bigint): void {
    this.lastOutcome = this.repeats(spellId)
      ? this.autoRepeat.send(spellId, targetGuid)
      : this.casts.send(spellId, targetGuid);
    this.emit("cast_sent");
  }

  useItem(spellId: number, item: CombatItem): void {
    this.lastOutcome = this.casts.sendItem(spellId, item);
    this.emit("cast_sent");
  }

  attack(targetGuid: bigint): void {
    if (targetGuid <= 0n || targetGuid > 0xffffffffffffffffn)
      throw new Error("invalid_guid");
    this.deps.send(GameOpcode.CMSG_ATTACKSWING, buildAttackSwing(targetGuid));
    this.pendingAttack = targetGuid;
    this.lastOutcome = {
      kind: "attack",
      status: "sent",
      target: targetGuid,
      at: this.deps.now(),
    };
    this.emit("outcome");
  }

  cancelCast(): void {
    this.lastOutcome = this.casts.cancel();
    this.emit("outcome");
  }

  stopAttack(): void {
    this.deps.send(GameOpcode.CMSG_ATTACKSTOP);
    this.pendingAttack = undefined;
    this.lastOutcome = { kind: "attack", status: "sent", at: this.deps.now() };
    this.emit("outcome");
  }

  stopAutoRepeat(): void {
    const outcome = this.autoRepeat.stop();
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("outcome", "auto_repeat_stopped");
  }

  applyCancelAutoRepeat(_packet: CancelAutoRepeat): void {
    const outcome = this.autoRepeat.cancelled();
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("outcome", "auto_repeat_cancelled");
  }

  interruptCast(): void {
    if (this.casts.hasUncancelled()) this.cancelCast();
  }

  halt(): void {
    this.interruptCast();
    this.stopAutoRepeat();
    if (this.attacking || this.pendingAttack !== undefined) this.stopAttack();
  }

  dispose(): void {
    this.events.clear();
    this.incomingAttackers.clear();
    this.motions.clear();
    this.auras.clear();
    this.learned.clear();
    this.cooldowns.clear();
    this.casts.clear();
    this.autoRepeat.clear();
    this.pendingAttack = undefined;
    this.attacking = false;
    this.attackTarget = undefined;
  }

  forget(guid: bigint): void {
    this.incomingAttackers.delete(guid);
    this.motions.forget(guid);
    this.auras.forget(guid);
  }

  observePosition(
    guid: bigint,
    position: Position,
    spline?: CreateSpline,
    source?: PositionSource,
  ): void {
    this.motions.observe(guid, position, spline, source);
  }

  observedPosition(guid: bigint): ObservedPosition | undefined {
    return this.motions.observation(guid);
  }

  applyInitialSpells(packet: InitialSpells): void {
    this.learned.clear();
    for (const spell of packet.spells) this.learned.add(spell.spellId);
    this.cooldowns.reset(packet.cooldowns);
    this.emit("spellbook");
  }

  applyLearned({ spellId }: LearnedSpell): void {
    this.learned.add(spellId);
    this.emit("learned");
  }

  applyRemoved({ spellId }: RemovedSpell): void {
    this.learned.delete(spellId);
    this.emit("learned");
  }

  applySuperseded({ superseded, learned }: SupersededSpell): void {
    this.learned.delete(superseded);
    this.learned.add(learned);
    this.emit("learned");
  }

  applySpellStart(packet: SpellStart): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    const outcome = this.repeats(packet.spellId)
      ? this.autoRepeat.start(packet)
      : this.casts.start(packet);
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("cast_started");
  }

  applySpellGo(packet: SpellGo): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    this.lastOutcome = this.repeats(packet.spellId)
      ? this.autoRepeat.shot(packet)
      : this.casts.succeed(packet);
    this.emit("cast_succeeded");
  }

  applyCastFailed(packet: CastFailed): void {
    const outcome = (
      this.repeats(packet.spellId) ? this.autoRepeat : this.casts
    ).fail(packet.spellId, packet.castCount, packet.result, "failed");
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("cast_failed", `cast_failed:${outcome.reason}`);
  }

  applyInventoryFailure(packet: InventoryChangeFailure): void {
    if (packet.kind !== "error") return;
    const outcome = this.casts.rejectItem(packet.item1, packet.result);
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("cast_failed", `inventory_failed:${packet.result}`);
  }

  applySpellFailure(packet: SpellFailure): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    const outcome = (
      this.repeats(packet.spellId) ? this.autoRepeat : this.casts
    ).fail(packet.spellId, packet.extraCasts, packet.result, "interrupted");
    if (!outcome) return;
    this.lastOutcome = outcome;
    this.emit("cast_interrupted", `spell_failure:${outcome.reason}`);
  }

  applyCooldown(packet: SpellCooldown): void {
    if (packet.guid !== this.deps.selfGuid()) return;
    for (const cd of packet.cooldowns)
      this.cooldowns.observe(cd.spellId, cd.time);
  }

  applyClearCooldown({ spellId, guid }: CooldownNotice): void {
    if (guid !== this.deps.selfGuid()) return;
    this.cooldowns.release(spellId);
    this.emit("outcome", "cooldown_cleared");
  }

  applyCooldownEvent({ spellId, guid }: CooldownNotice): void {
    if (guid !== this.deps.selfGuid()) return;
    this.cooldowns.predict(spellId);
    this.emit("outcome", "cooldown_event");
  }

  applySpellDelayed({ caster, delayMs }: SpellDelayed): void {
    if (caster !== this.deps.selfGuid() || !this.casts.delay(delayMs)) return;
    this.emit("cast_started", "cast_delayed");
  }

  applyAttackError(error: AttackSwingError): void {
    this.lastOutcome = {
      kind: "attack",
      status: "failed",
      target: this.attackTarget ?? this.pendingAttack,
      error,
      at: this.deps.now(),
    };
    this.pendingAttack = undefined;
    this.emit("outcome", `attack_failed:${error}`);
  }

  applyCancelCombat(): void {
    this.pendingAttack = undefined;
    this.attacking = false;
    this.attackTarget = undefined;
    this.lastOutcome = {
      kind: "attack",
      status: "interrupted",
      at: this.deps.now(),
    };
    this.emit("attack_stopped");
  }

  applyAttackStart(packet: AttackStart): void {
    if (packet.attacker === this.deps.selfGuid()) {
      this.pendingAttack = undefined;
      this.attacking = true;
      this.attackTarget = packet.victim;
      this.lastOutcome = {
        kind: "attack",
        status: "started",
        target: packet.victim,
        at: this.deps.now(),
      };
      this.emit("attack_started");
    } else if (packet.victim === this.deps.selfGuid()) {
      this.incomingAttackers.add(packet.attacker);
      this.emit("attacked", undefined, packet.attacker);
    }
  }

  applyAttackStop(packet: AttackStop): void {
    if (packet.attacker === this.deps.selfGuid()) {
      this.pendingAttack = undefined;
      this.attacking = false;
      this.attackTarget = undefined;
      this.lastOutcome = {
        kind: "attack",
        status: stopStatus(packet),
        target: packet.victim,
        at: this.deps.now(),
      };
      this.emit("attack_stopped");
    } else if (this.incomingAttackers.has(packet.attacker)) {
      this.incomingAttackers.delete(packet.attacker);
    }
  }

  applyAura(update: AuraUpdate): void {
    this.auras.apply(update);
    this.emit("aura");
  }

  applyAuraAll(update: AuraUpdateAll): void {
    this.auras.replace(update);
    this.emit("aura");
  }

  applyXp(packet: XpGain): void {
    this.lastXp = {
      victim: packet.victim,
      total: packet.total,
      kind: packet.kind,
      at: this.deps.now(),
    };
    this.emit("xp");
  }

  applyLevelUp(packet: LevelUpInfo): void {
    this.lastLevelUp = { ...packet, at: this.deps.now() };
    this.emit("level_up");
  }

  applyMonsterMove(packet: MonsterMove, mapId: number): void {
    this.motions.monsterMove(packet, mapId);
  }

  private repeats(spellId: number): boolean {
    return ((this.definition(spellId)?.attributes?.ex2 ?? 0) & 0x20) !== 0;
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

  private emit(
    type: CombatEventType,
    reason?: string,
    attacker?: bigint,
  ): void {
    const event: CombatEvent = { type, state: this.snapshot() };
    if (reason !== undefined) event.reason = reason;
    if (attacker !== undefined) event.attacker = attacker;
    const spellId = event.state.lastOutcome?.spellId;
    const spellName =
      type.startsWith("cast_") && spellId !== undefined
        ? this.deps.catalog?.get(spellId)?.name
        : undefined;
    if (spellName !== undefined) event.spellName = spellName;
    this.events.emit(event);
  }
}

function stopStatus(packet: AttackStop): CombatOutcome["status"] {
  if (packet.victim === undefined) return "failed";
  return packet.dead ? "succeeded" : "interrupted";
}
