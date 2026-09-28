import { Emitter, type Unsubscribe } from "#lib/emitter";
import { AuraStore } from "#wow/aura-store";
import { AutoRepeatTracker } from "#wow/combat-auto-repeat";
import { CombatCasts } from "#wow/combat-casts";
import type {
  CombatEventType,
  CombatOutcome,
  CombatPetCommand,
  CombatState,
  CombatXp,
} from "#wow/combat-types";
import { CooldownStore } from "#wow/cooldown-store";
import { type EntityLookup, isUnit } from "#wow/entity-store";
import type { AuraUpdate, AuraUpdateAll } from "#wow/protocol/aura";
import type {
  AttackStart,
  AttackStop,
  AttackSwingError,
  CancelAutoRepeat,
  XpGain,
} from "#wow/protocol/combat";
import type { LevelUpInfo } from "#wow/protocol/experience";
import type { InventoryChangeFailure } from "#wow/protocol/inventory";
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

export type CombatStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export type CombatChange = {
  type: CombatEventType;
  reason?: string;
  attacker?: bigint;
};

export type CombatRecord = Omit<
  CombatState,
  "self" | "target" | "selectedGuid"
>;

export class CombatStore {
  private readonly deps: CombatStoreDeps;
  private readonly changes = new Emitter<[CombatChange]>();
  private readonly incomingAttackers = new Set<bigint>();
  private readonly learnedSpells = new Set<number>();
  private readonly cooldowns: CooldownStore;
  private readonly auras: AuraStore;
  readonly casts: CombatCasts;
  readonly autoRepeat: AutoRepeatTracker;
  private catalog: SpellCatalog | undefined;
  private pendingAttack: bigint | undefined;
  private attackingNow = false;
  private attackTarget: bigint | undefined;
  private lastOutcome: CombatOutcome | undefined;
  private lastXp: CombatXp | undefined;
  private petCommand: CombatPetCommand | undefined;
  private lastLevelUp: CombatState["lastLevelUp"];

  constructor(deps: CombatStoreDeps) {
    this.deps = deps;
    this.cooldowns = new CooldownStore(
      deps.now,
      (id) => this.definition(id)?.cooldown,
    );
    this.auras = new AuraStore(deps.now, (id) => this.definition(id)?.name);
    this.casts = new CombatCasts({
      now: deps.now,
      learned: this.learnedSpells,
      cooldowns: this.cooldowns,
    });
    this.autoRepeat = new AutoRepeatTracker({
      now: deps.now,
      casts: this.casts,
    });
  }

  onChange(listener: (change: CombatChange) => void): Unsubscribe {
    return this.changes.subscribe(listener);
  }

  get attacking(): boolean {
    return this.attackingNow;
  }

  get attackPending(): boolean {
    return this.pendingAttack !== undefined;
  }

  setCatalog(catalog: SpellCatalog): void {
    this.catalog = catalog;
  }

  definition(id: number): SpellDefinition | undefined {
    return this.catalog?.get(id);
  }

  learned(): number[] {
    return [...this.learnedSpells];
  }

  spellbook(): SpellDefinition[] {
    const catalog = this.catalog;
    if (!catalog) throw new Error("missing_spell_data");
    const defs: SpellDefinition[] = [];
    for (const id of this.learnedSpells) {
      const def = catalog.get(id);
      if (def) defs.push(def);
    }
    return defs;
  }

  repeats(spellId: number): boolean {
    return ((this.definition(spellId)?.attributes?.ex2 ?? 0) & 0x20) !== 0;
  }

  readyAt(id: number): number {
    return this.cooldowns.readyAt(id);
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

  record(selected: bigint | undefined): CombatRecord {
    return {
      attacking: this.attackingNow,
      pendingAttack: this.pendingAttack,
      attackTarget: this.attackTarget,
      casting: this.casts.casting ? { ...this.casts.casting } : undefined,
      pendingCast: this.casts.pending ? { ...this.casts.pending } : undefined,
      autoRepeat: this.autoRepeat.state,
      petCommand: this.petCommand,
      learned: [...this.learnedSpells],
      unknownLearned: [...this.learnedSpells].filter(
        (id) => !this.catalog?.get(id),
      ),
      cooldowns: this.cooldowns.list(this.learnedSpells),
      auras: this.auras.forUnit(this.deps.selfGuid()),
      targetAuras: selected ? this.auras.forUnit(selected) : [],
      lastOutcome: this.lastOutcome,
      lastXp: this.lastXp,
      lastLevelUp: this.lastLevelUp,
      attackers: this.attackers(),
    };
  }

  sent(outcome: CombatOutcome, type: CombatEventType, reason?: string): void {
    this.lastOutcome = outcome;
    this.emit(type, reason);
  }

  attackSent(target: bigint | undefined): void {
    this.pendingAttack = target;
    this.lastOutcome = {
      kind: "attack",
      status: "sent",
      ...(target !== undefined && { target }),
      at: this.deps.now(),
    };
    this.emit("outcome");
  }

  petCommanded(pet: bigint, target: bigint): void {
    this.petCommand = { at: this.deps.now(), pet, target };
    this.emit("outcome", "pet_attack");
  }

  clear(): void {
    this.changes.clear();
    this.incomingAttackers.clear();
    this.auras.clear();
    this.learnedSpells.clear();
    this.cooldowns.clear();
    this.casts.clear();
    this.autoRepeat.clear();
    this.petCommand = undefined;
    this.pendingAttack = undefined;
    this.attackingNow = false;
    this.attackTarget = undefined;
  }

  forget(guid: bigint): void {
    this.incomingAttackers.delete(guid);
    this.auras.forget(guid);
  }

  applyInitialSpells(packet: InitialSpells): void {
    this.learnedSpells.clear();
    for (const spell of packet.spells) this.learnedSpells.add(spell.spellId);
    this.cooldowns.reset(packet.cooldowns);
    this.emit("spellbook");
  }

  applyLearned({ spellId }: LearnedSpell): void {
    this.learnedSpells.add(spellId);
    this.emit("learned");
  }

  applyRemoved({ spellId }: RemovedSpell): void {
    this.learnedSpells.delete(spellId);
    this.emit("learned");
  }

  applySuperseded({ superseded, learned }: SupersededSpell): void {
    this.learnedSpells.delete(superseded);
    this.learnedSpells.add(learned);
    this.emit("learned");
  }

  applySpellStart(packet: SpellStart): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    const outcome = this.repeats(packet.spellId)
      ? this.autoRepeat.start(packet)
      : this.casts.start(packet);
    if (!outcome) return;
    this.sent(outcome, "cast_started");
  }

  applySpellGo(packet: SpellGo): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    this.sent(
      this.repeats(packet.spellId)
        ? this.autoRepeat.shot(packet)
        : this.casts.succeed(packet),
      "cast_succeeded",
    );
  }

  applyCastFailed(packet: CastFailed): void {
    const outcome = (
      this.repeats(packet.spellId) ? this.autoRepeat : this.casts
    ).fail(packet.spellId, packet.castCount, packet.result, "failed");
    if (!outcome) return;
    this.sent(outcome, "cast_failed", `cast_failed:${outcome.reason}`);
  }

  applyInventoryFailure(packet: InventoryChangeFailure): void {
    if (packet.kind !== "error") return;
    const outcome = this.casts.rejectItem(packet.item1, packet.result);
    if (!outcome) return;
    this.sent(outcome, "cast_failed", `inventory_failed:${packet.result}`);
  }

  applySpellFailure(packet: SpellFailure): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    const outcome = (
      this.repeats(packet.spellId) ? this.autoRepeat : this.casts
    ).fail(packet.spellId, packet.extraCasts, packet.result, "interrupted");
    if (!outcome) return;
    this.sent(outcome, "cast_interrupted", `spell_failure:${outcome.reason}`);
  }

  applyCancelAutoRepeat(_packet: CancelAutoRepeat): void {
    const outcome = this.autoRepeat.cancelled();
    if (!outcome) return;
    this.sent(outcome, "outcome", "auto_repeat_cancelled");
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
    this.attackingNow = false;
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
      this.attackingNow = true;
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

  noteHostileDamage(guid: bigint): void {
    if (this.incomingAttackers.has(guid)) return;
    this.incomingAttackers.add(guid);
    this.emit("attacked", undefined, guid);
  }

  applyAttackStop(packet: AttackStop): void {
    if (packet.attacker === this.deps.selfGuid()) {
      this.pendingAttack = undefined;
      this.attackingNow = false;
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

  private emit(
    type: CombatEventType,
    reason?: string,
    attacker?: bigint,
  ): void {
    const change: CombatChange = { type };
    if (reason !== undefined) change.reason = reason;
    if (attacker !== undefined) change.attacker = attacker;
    this.changes.emit(change);
  }
}

function stopStatus(packet: AttackStop): CombatOutcome["status"] {
  if (packet.victim === undefined) return "failed";
  return packet.dead ? "succeeded" : "interrupted";
}
