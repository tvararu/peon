import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AiReaction,
  AiReactionPacket,
  BreakTarget,
  ClearTarget,
  ThreatClear,
  ThreatRemove,
  ThreatUpdate,
  ThreatWireEntry,
} from "#wow/areas/threat/protocol";
import { joinGuid } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type ThreatEntry = {
  victim: bigint;
  threat: number;
  pct: number;
  isVictim: boolean;
};
export type ThreatTable = {
  unit: bigint;
  victim: bigint | undefined;
  entries: readonly ThreatEntry[];
  pullAt: { melee: number; ranged: number } | undefined;
  updatedAt: number;
};
export type ThreatReaction = {
  unit: bigint;
  reaction: AiReaction;
  code: number;
  at: number;
};
export type ThreatState = {
  tables: readonly ThreatTable[];
  reactions: readonly ThreatReaction[];
  petReaction: { pet: bigint; at: number } | undefined;
};
export type ThreatEvent =
  | {
      type: "table";
      unit: bigint;
      victim: bigint | undefined;
      entries: readonly ThreatEntry[];
    }
  | {
      type: "victim_changed";
      unit: bigint;
      from: bigint | undefined;
      to: bigint;
    }
  | { type: "removed"; unit: bigint; victim: bigint }
  | { type: "cleared"; unit: bigint }
  | {
      type: "reaction";
      unit: bigint;
      reaction: AiReaction;
      code: number;
      pet: boolean;
    }
  | { type: "target_broken"; unit: bigint; hostileOnly: boolean };

type Stored = {
  victim: bigint | undefined;
  entries: readonly ThreatWireEntry[];
  updatedAt: number;
};

function shareOf(threat: number, top: number): number {
  return top === 0 ? 100 : Math.round((threat * 100) / top);
}

function entriesOf(stored: Stored): ThreatEntry[] {
  const sorted = [...stored.entries].sort((a, b) => b.threat - a.threat);
  const top = sorted[0]?.threat ?? 0;
  return sorted.map(({ victim, threat }) => ({
    victim,
    threat,
    pct: shareOf(threat, top),
    isVictim: victim === stored.victim,
  }));
}

function pullOf(stored: Stored): ThreatTable["pullAt"] {
  const current = stored.entries.find(
    (entry) => entry.victim === stored.victim,
  );
  if (!current) return undefined;
  return {
    melee: (current.threat * 11) / 10,
    ranged: (current.threat * 13) / 10,
  };
}

export class ThreatStore {
  private readonly events = new Emitter<[ThreatEvent]>();
  private readonly tables = new Map<bigint, Stored>();
  private readonly reactions = new Map<bigint, ThreatReaction>();
  private petReaction: ThreatState["petReaction"];
  private readonly now: () => number;
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
    this.now = deps.now;
  }

  snapshot(): ThreatState {
    return {
      tables: [...this.tables].map(([unit, stored]) => ({
        unit,
        victim: stored.victim,
        entries: entriesOf(stored),
        pullAt: pullOf(stored),
        updatedAt: stored.updatedAt,
      })),
      reactions: [...this.reactions.values()].map((row) => ({ ...row })),
      petReaction: this.petReaction && { ...this.petReaction },
    };
  }

  private pet(): bigint | undefined {
    const fields = this.deps.getEntity(this.deps.selfGuid())?.rawFields;
    const low = fields?.get(UNIT_FIELDS.SUMMON.offset) ?? 0;
    const high = fields?.get(UNIT_FIELDS.SUMMON.offset + 1) ?? 0;
    if (low !== 0 || high !== 0) return joinGuid(low, high);
    return this.core.combat.record(undefined).petCommand?.pet;
  }

  onEvent(cb: (event: ThreatEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  update(packet: ThreatUpdate): void {
    const from = this.tables.get(packet.unit)?.victim;
    const stored: Stored = {
      victim: packet.newVictim ?? from,
      entries: packet.entries.map((entry) => ({ ...entry })),
      updatedAt: this.now(),
    };
    this.tables.set(packet.unit, stored);
    if (packet.newVictim !== undefined && packet.newVictim !== from) {
      this.events.emit({
        type: "victim_changed",
        unit: packet.unit,
        from,
        to: packet.newVictim,
      });
      return;
    }
    this.events.emit({
      type: "table",
      unit: packet.unit,
      victim: stored.victim,
      entries: entriesOf(stored),
    });
  }

  remove(packet: ThreatRemove): void {
    const stored = this.tables.get(packet.unit);
    if (stored)
      this.tables.set(packet.unit, {
        victim: stored.victim === packet.victim ? undefined : stored.victim,
        entries: stored.entries.filter(
          (entry) => entry.victim !== packet.victim,
        ),
        updatedAt: this.now(),
      });
    this.events.emit({
      type: "removed",
      unit: packet.unit,
      victim: packet.victim,
    });
  }

  clearTable(packet: ThreatClear): void {
    this.tables.delete(packet.unit);
    this.events.emit({ type: "cleared", unit: packet.unit });
  }

  reaction(packet: AiReactionPacket): void {
    const at = this.now();
    this.reactions.delete(packet.unit);
    this.reactions.set(packet.unit, { ...packet, at });
    const pet = packet.unit === this.pet();
    if (pet) this.petReaction = { pet: packet.unit, at };
    this.events.emit({ type: "reaction", ...packet, pet });
  }

  breakTarget(packet: BreakTarget): void {
    this.events.emit({
      type: "target_broken",
      unit: packet.unit,
      hostileOnly: false,
    });
  }

  clearTarget(packet: ClearTarget): void {
    this.events.emit({
      type: "target_broken",
      unit: packet.caster,
      hostileOnly: true,
    });
  }

  forget(unit: bigint): void {
    this.tables.delete(unit);
    this.reactions.delete(unit);
    if (this.petReaction?.pet === unit) this.petReaction = undefined;
  }

  clear(): void {
    this.tables.clear();
    this.reactions.clear();
    this.petReaction = undefined;
  }

  dispose(): void {
    this.events.clear();
    this.clear();
  }
}
