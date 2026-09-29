import {
  type AttackerState,
  type DamageShield,
  type EnvironmentalDamage,
  type Instakill,
  type PeriodicAuraLog,
  type PeriodicTick,
  SPELL_MISS_NAMES,
  type SpellDamage,
  type SpellEnergize,
  type SpellHeal,
  type SpellImmune,
  type SpellMissLog,
} from "#wow/areas/combatlog/protocol";

export type CombatlogKind =
  | "melee"
  | "spell_damage"
  | "periodic_damage"
  | "damage_shield"
  | "environmental"
  | "instakill"
  | "heal"
  | "periodic_heal"
  | "energize"
  | "periodic_power"
  | "miss"
  | "immune"
  | "dispel"
  | "dispel_failed"
  | "steal"
  | "execute"
  | "kill";

export type CombatlogWire = Omit<CombatlogEntry, "at">;

export type CombatlogFight = {
  startedAt: number;
  lastAt: number;
  dealt: number;
  taken: number;
  healed: number;
  crits: number;
  misses: Record<string, number>;
};

export type CombatlogEntry = {
  at: number;
  kind: CombatlogKind;
  source: bigint;
  target: bigint;
  spellId?: number;
  amount: number;
  over?: number;
  schoolMask?: number;
  absorbed?: number;
  resisted?: number;
  blocked?: number;
  crit?: boolean;
  outcome?: string;
  power?: number;
  extra?: number;
};

const ABSORB_FULL = 0x20;
const RESIST_FULL = 0x80;
const AVOIDED = new Set([
  "dodge",
  "parry",
  "interrupt",
  "block",
  "evade",
  "immune",
  "deflect",
]);

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function meleeOutcome(swing: AttackerState): string | undefined {
  if (swing.miss) return "miss";
  if (AVOIDED.has(swing.victimState)) return swing.victimState;
  if (swing.hitInfo & ABSORB_FULL) return "absorb";
  if (swing.hitInfo & RESIST_FULL) return "resist";
  return undefined;
}

function optional(
  wire: CombatlogWire,
  fields: Partial<CombatlogWire>,
): CombatlogWire {
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined && value !== 0 && value !== false)
      Object.assign(wire, { [key]: value });
  return wire;
}

export function meleeEntry(swing: AttackerState): CombatlogWire {
  return optional(
    {
      kind: "melee",
      source: swing.attacker,
      target: swing.target,
      amount: swing.total,
    },
    {
      over: swing.overkill,
      schoolMask: swing.parts.reduce((mask, part) => mask | part.schoolMask, 0),
      absorbed: sum(swing.absorbed),
      resisted: sum(swing.resisted),
      blocked: swing.blocked,
      crit: swing.crit,
      outcome: meleeOutcome(swing),
    },
  );
}

export function spellDamageEntry(hit: SpellDamage): CombatlogWire {
  return optional(
    {
      kind: "spell_damage",
      source: hit.attacker,
      target: hit.target,
      amount: hit.amount,
    },
    {
      spellId: hit.spellId,
      over: hit.overkill,
      schoolMask: hit.schoolMask,
      absorbed: hit.absorbed,
      resisted: hit.resisted,
      blocked: hit.blocked,
      crit: hit.crit,
    },
  );
}

function effective(heal: number, overheal: number): number {
  return Math.max(0, heal - overheal);
}

export function healEntry(heal: SpellHeal): CombatlogWire {
  return optional(
    {
      kind: "heal",
      source: heal.caster,
      target: heal.victim,
      amount: effective(heal.heal, heal.overheal),
    },
    {
      spellId: heal.spellId,
      over: heal.overheal,
      absorbed: heal.absorbed,
      crit: heal.crit,
    },
  );
}

export function energizeEntry(energize: SpellEnergize): CombatlogWire {
  return {
    kind: "energize",
    source: energize.caster,
    target: energize.victim,
    spellId: energize.spellId,
    power: energize.power,
    amount: energize.amount,
  };
}

function tickEntry(log: PeriodicAuraLog, tick: PeriodicTick): CombatlogWire {
  const ends = { source: log.caster, target: log.victim };
  switch (tick.type) {
    case "damage":
      return optional(
        { kind: "periodic_damage", ...ends, amount: tick.amount },
        {
          spellId: log.spellId,
          over: tick.overkill,
          schoolMask: tick.schoolMask,
          absorbed: tick.absorbed,
          resisted: tick.resisted,
          crit: tick.crit,
        },
      );
    case "heal":
      return optional(
        {
          kind: "periodic_heal",
          ...ends,
          amount: effective(tick.amount, tick.overheal),
        },
        {
          spellId: log.spellId,
          over: tick.overheal,
          absorbed: tick.absorbed,
          crit: tick.crit,
        },
      );
    default:
      return {
        kind: "periodic_power",
        ...ends,
        spellId: log.spellId,
        power: tick.power,
        amount: tick.amount,
      };
  }
}

export function periodicEntries(log: PeriodicAuraLog): CombatlogWire[] {
  return log.ticks.map((tick) => tickEntry(log, tick));
}

function missName(reason: number): string {
  return SPELL_MISS_NAMES[reason] ?? `unknown_${reason}`;
}

export function missEntry(
  caster: bigint,
  target: bigint,
  spellId: number,
  reason: number,
): CombatlogWire {
  return {
    kind: "miss",
    source: caster,
    target,
    spellId,
    amount: 0,
    outcome: missName(reason),
  };
}

export function spellMissEntries(log: SpellMissLog): CombatlogWire[] {
  return log.targets.map((target) =>
    missEntry(log.caster, target.guid, log.spellId, target.reason),
  );
}

export function immuneEntry(immune: SpellImmune): CombatlogWire {
  return {
    kind: "immune",
    source: immune.caster,
    target: immune.target,
    spellId: immune.spellId,
    amount: 0,
    outcome: "immune",
  };
}

export function damageShieldEntry(shield: DamageShield): CombatlogWire {
  return optional(
    {
      kind: "damage_shield",
      source: shield.owner,
      target: shield.attacker,
      amount: shield.damage,
    },
    {
      spellId: shield.spellId,
      over: shield.overkill,
      schoolMask: shield.schoolMask,
    },
  );
}

export function environmentalEntry(hit: EnvironmentalDamage): CombatlogWire {
  return optional(
    {
      kind: "environmental",
      source: 0n,
      target: hit.victim,
      amount: hit.amount,
      extra: hit.type,
    },
    { resisted: hit.resisted, absorbed: hit.absorbed },
  );
}

export function instakillEntry(kill: Instakill): CombatlogWire {
  return {
    kind: "instakill",
    source: kill.caster,
    target: kill.target,
    spellId: kill.spellId,
    amount: 0,
  };
}
