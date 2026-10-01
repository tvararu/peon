import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  CombatlogEntry,
  CombatlogKind,
  CombatlogWire,
  CombatlogFight as Fight,
} from "#wow/areas/combatlog/entries";
import type {
  ComboPoints,
  PartyKill,
  PowerUpdate,
} from "#wow/areas/combatlog/protocol";
import type { Entity, UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { joinGuid } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type FightTotals = {
  startedAt: number;
  lastAt: number;
  dealt: number;
  taken: number;
  healed: number;
  crits: number;
  misses: Readonly<Record<string, number>>;
};

export type CombatlogImmunity = { entry: number; spellId: number; at: number };
export type CombatlogKillerKind =
  | "self"
  | "pet"
  | "player"
  | "creature"
  | "unknown";
export type CombatlogKill = {
  killer: bigint;
  victim: bigint;
  at: number;
  bySelf: boolean;
  ourTarget: boolean;
  killerKind: CombatlogKillerKind;
};

export type CombatlogState = {
  entries: readonly CombatlogEntry[];
  fight: FightTotals | undefined;
  lastFight: FightTotals | undefined;
  immunities: readonly CombatlogImmunity[];
  comboPoints: { target: bigint; points: number } | undefined;
  kills: readonly CombatlogKill[];
  dropped: number;
};

export type CombatlogEvent =
  | ({ type: "entry" } & Omit<CombatlogEntry, "crit"> & { crit?: number })
  | { type: "combo_points"; target?: bigint; points: number }
  | ({ type: "fight_closed" } & FightTotals)
  | ({ type: "kill" } & Omit<CombatlogKill, "bySelf" | "ourTarget"> & {
        bySelf: number;
        ourTarget: number;
      });

const RING = 500;
const KILLS = 20;
const QUIET_MS = 6000;
const POWERS = 7;
function creatureEntry(guid: bigint): number | undefined {
  const high = Number(BigInt.asUintN(16, guid >> 48n));
  if (!CREATURE_HIGHS.has(high)) return undefined;
  return Number(BigInt.asUintN(24, guid >> 24n));
}

function isImmune(entry: CombatlogEntry): boolean {
  if (entry.kind === "immune") return true;
  return entry.kind === "miss" && IMMUNE_OUTCOMES.has(entry.outcome ?? "");
}

const CREATURE_HIGHS = new Set([0xf1_30, 0xf1_50]);
const IMMUNE_OUTCOMES = new Set(["immune", "immune2"]);
const DAMAGE = new Set<CombatlogKind>([
  "melee",
  "spell_damage",
  "periodic_damage",
  "damage_shield",
  "environmental",
  "instakill",
]);
export const UTILITY_KINDS = new Set<CombatlogKind>([
  "dispel",
  "dispel_failed",
  "steal",
  "execute",
]);
const HEALS = new Set<CombatlogKind>(["heal", "periodic_heal"]);
export class CombatlogStore {
  private readonly events = new Emitter<[CombatlogEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private readonly entries: CombatlogEntry[] = [];
  private readonly fightUnits = new Set<bigint>();
  private readonly kills: CombatlogKill[] = [];
  private readonly immunities: CombatlogImmunity[] = [];
  private comboPoints: { target: bigint; points: number } | undefined;
  private fight: Fight | undefined;
  private lastFight: Fight | undefined;
  private dropped = 0;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): CombatlogState {
    this.roll(this.deps.now());
    return {
      entries: this.entries.map((entry) => ({ ...entry })),
      fight: totalsOf(this.fight),
      lastFight: totalsOf(this.lastFight),
      immunities: this.immunities.map((immunity) => ({ ...immunity })),
      comboPoints: this.comboPoints && { ...this.comboPoints },
      kills: this.kills.map((kill) => ({ ...kill })),
      dropped: this.dropped,
    };
  }

  onEvent(cb: (event: CombatlogEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  closeFight(): void {
    this.roll(this.deps.now());
  }

  receive(wires: readonly CombatlogWire[]): void {
    for (const wire of wires) this.receiveOne(wire);
  }

  receiveKill({ killer, victim }: PartyKill): void {
    const at = this.deps.now();
    const kill: CombatlogKill = {
      killer,
      victim,
      at,
      bySelf: killer === this.deps.selfGuid(),
      ourTarget: victim === this.selfTarget(),
      killerKind: this.kindOf(killer),
    };
    this.kills.push(kill);
    if (this.kills.length > KILLS)
      this.kills.splice(0, this.kills.length - KILLS);
    this.push({ at, kind: "kill", source: killer, target: victim, amount: 0 });
    this.events.emit({
      type: "kill",
      ...kill,
      bySelf: kill.bySelf ? 1 : 0,
      ourTarget: kill.ourTarget ? 1 : 0,
    });
  }

  receiveComboPoints({ target, points }: ComboPoints): void {
    this.comboPoints =
      target !== undefined && points > 0 ? { target, points } : undefined;
    this.events.emit({
      type: "combo_points",
      ...(target === undefined ? {} : { target }),
      points,
    });
  }

  applyPower({ guid, power, value }: PowerUpdate): void {
    const unit = this.deps.getEntity(guid);
    if (!isUnit(unit) || power >= POWERS) return;
    const slots = [...unit.power];
    slots[power] = value;
    this.deps.updateEntity(
      guid,
      { power: slots },
      new Map([[UNIT_FIELDS.POWER1.offset + power, value]]),
    );
  }

  dispose(): void {
    this.events.clear();
    this.entries.length = 0;
    this.kills.length = 0;
    this.immunities.length = 0;
    this.comboPoints = undefined;
    this.fightUnits.clear();
    this.fight = undefined;
    this.lastFight = undefined;
  }

  private receiveOne(wire: CombatlogWire): void {
    const at = this.deps.now();
    this.roll(at);
    const sourceOurs = this.isOurs(wire.source);
    const targetOurs = this.isOurs(wire.target);
    if (
      !(
        sourceOurs ||
        targetOurs ||
        this.inFight(wire.source) ||
        this.inFight(wire.target)
      )
    ) {
      this.dropped++;
      return;
    }
    const entry: CombatlogEntry = { at, ...wire };
    this.push(entry);
    if (sourceOurs || targetOurs) this.count(entry, sourceOurs, targetOurs);
    this.markAttacker(entry);
    if (sourceOurs) this.noteImmunity(entry);
    const { crit, ...plain } = entry;
    this.events.emit({ type: "entry", ...plain, ...(crit ? { crit: 1 } : {}) });
  }

  private push(entry: CombatlogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > RING)
      this.entries.splice(0, this.entries.length - RING);
  }

  private trackUnit(guid: bigint, ours: boolean): void {
    if (ours || guid === 0n) return;
    this.fightUnits.add(guid);
  }

  private count(
    entry: CombatlogEntry,
    sourceOurs: boolean,
    targetOurs: boolean,
  ): void {
    if (UTILITY_KINDS.has(entry.kind)) return;
    const fight = this.fight ?? this.open(entry.at);
    fight.lastAt = entry.at;
    this.trackUnit(entry.source, sourceOurs);
    this.trackUnit(entry.target, targetOurs);
    if (entry.outcome !== undefined)
      fight.misses[entry.outcome] = (fight.misses[entry.outcome] ?? 0) + 1;
    if (entry.crit && sourceOurs) fight.crits++;
    if (DAMAGE.has(entry.kind)) {
      if (sourceOurs && !targetOurs) fight.dealt += entry.amount;
      if (entry.target === this.deps.selfGuid()) fight.taken += entry.amount;
    }
    if (HEALS.has(entry.kind) && entry.target === this.deps.selfGuid())
      fight.healed += entry.amount;
  }

  private open(at: number): Fight {
    this.fight = {
      startedAt: at,
      lastAt: at,
      dealt: 0,
      taken: 0,
      healed: 0,
      crits: 0,
      misses: {},
    };
    return this.fight;
  }

  private roll(now: number): void {
    if (!this.fight || now - this.fight.lastAt < QUIET_MS) return;
    const closed = this.fight;
    this.lastFight = closed;
    this.fight = undefined;
    this.fightUnits.clear();
    this.events.emit({
      type: "fight_closed",
      ...closed,
      misses: { ...closed.misses },
    });
  }

  private noteImmunity(entry: CombatlogEntry): void {
    const spellId = entry.spellId ?? 0;
    const target = creatureEntry(entry.target);
    if (!isImmune(entry) || spellId === 0 || target === undefined) return;
    if (
      this.immunities.some(
        (known) => known.entry === target && known.spellId === spellId,
      )
    )
      return;
    this.immunities.push({ at: entry.at, entry: target, spellId });
  }

  private markAttacker(entry: CombatlogEntry): void {
    const self = this.deps.selfGuid();
    if (entry.source === 0n) return;
    if (!DAMAGE.has(entry.kind) || entry.target !== self) return;
    if (entry.source === self) return;
    this.core.combat.noteHostileDamage(entry.source);
  }

  isOurs(guid: bigint): boolean {
    const self = this.deps.selfGuid();
    return guid === self || this.isOwned(guid);
  }

  private isOwned(guid: bigint): boolean {
    const self = this.deps.selfGuid();
    if (self === 0n) return false;
    const fields = this.deps.getEntity(guid)?.rawFields;
    if (!fields) return false;
    return [UNIT_FIELDS.SUMMONEDBY, UNIT_FIELDS.CREATEDBY].some(
      (field) => guidField(fields, field.offset) === self,
    );
  }

  private kindOf(guid: bigint): CombatlogKillerKind {
    if (guid === this.deps.selfGuid()) return "self";
    if (this.isOwned(guid)) return "pet";
    const type = this.deps.getEntity(guid)?.objectType;
    if (type === ObjectType.PLAYER) return "player";
    if (type === ObjectType.UNIT) return "creature";
    return "unknown";
  }

  private selfTarget(): bigint | undefined {
    const fields = this.deps.getEntity(this.deps.selfGuid())?.rawFields;
    if (!fields) return undefined;
    const target = guidField(fields, UNIT_FIELDS.TARGET.offset);
    return target === 0n ? undefined : target;
  }

  private inFight(guid: bigint): boolean {
    return this.fightUnits.has(guid) || this.core.combat.isAttackingSelf(guid);
  }
}

function isUnit(entity: Entity | undefined): entity is UnitEntity {
  return (
    entity?.objectType === ObjectType.UNIT ||
    entity?.objectType === ObjectType.PLAYER
  );
}

function guidField(fields: ReadonlyMap<number, number>, offset: number) {
  return joinGuid(fields.get(offset) ?? 0, fields.get(offset + 1) ?? 0);
}

function totalsOf(fight: Fight | undefined): FightTotals | undefined {
  return fight ? { ...fight, misses: { ...fight.misses } } : undefined;
}
