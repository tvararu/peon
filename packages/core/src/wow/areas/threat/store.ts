import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ThreatClear,
  ThreatRemove,
  ThreatUpdate,
  ThreatWireEntry,
} from "#wow/areas/threat/protocol";
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
export type ThreatState = { tables: readonly ThreatTable[] };
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
  | { type: "cleared"; unit: bigint };

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
  private readonly now: () => number;

  constructor(deps: SessionDeps, _core: CoreStores) {
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
    };
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

  forget(unit: bigint): void {
    this.tables.delete(unit);
  }

  clear(): void {
    this.tables.clear();
  }

  dispose(): void {
    this.events.clear();
    this.tables.clear();
  }
}
