import type { CombatStore } from "#wow/combat-store";
import { joinGuid } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

export type UnitCastKind = "cast" | "channel";
export type UnitCastOutcome =
  | "succeeded"
  | "interrupted"
  | "expired"
  | "finished";

export type UnitCast = {
  guid: bigint;
  spellId: number;
  kind: UnitCastKind;
  startedAt: number;
  durationMs: number;
  target: bigint | undefined;
  relevant: boolean;
};

export type UnitCastStart = {
  type: "unit_cast_start";
  guid: bigint;
  spellId: number;
  spellName: string | undefined;
  kind: UnitCastKind;
  durationMs: number;
  relevant: 1 | 0;
};

export type UnitCastEnd = {
  type: "unit_cast_end";
  guid: bigint;
  spellId: number;
  spellName: string | undefined;
  outcome: UnitCastOutcome;
  relevant: 1 | 0;
};

export type UnitCastEvent = UnitCastStart | UnitCastEnd;

const MAX_CASTS = 64;
const SETTLE_MS = 50;

function selfTarget(deps: SessionDeps): bigint | undefined {
  const fields = deps.getEntity(deps.selfGuid())?.rawFields;
  if (!fields) return undefined;
  const target = joinGuid(
    fields.get(UNIT_FIELDS.TARGET.offset) ?? 0,
    fields.get(UNIT_FIELDS.TARGET.offset + 1) ?? 0,
  );
  return target === 0n ? undefined : target;
}

export class UnitCasts {
  private readonly deps: SessionDeps;
  private readonly combat: CombatStore;
  private readonly casts = new Map<bigint, UnitCast>();
  private readonly settling = new Map<bigint, Timer>();
  private readonly shortenedEnds = new Map<bigint, number>();
  private readonly emit: (event: UnitCastEvent) => void;

  constructor(
    deps: SessionDeps,
    combat: CombatStore,
    emit: (event: UnitCastEvent) => void,
  ) {
    this.combat = combat;
    this.deps = deps;
    this.emit = emit;
  }

  castOf(guid: bigint): UnitCast | undefined {
    this.collectExpired();
    return this.casts.get(guid);
  }

  snapshot(): readonly UnitCast[] {
    this.collectExpired();
    return [...this.casts.values()];
  }

  start(entry: Omit<UnitCast, "relevant">): void {
    const guid = entry.guid;
    const relevant = this.isRelevant(guid);
    this.casts.delete(guid);
    this.unsettle(guid);
    this.shortenedEnds.delete(guid);
    if (this.casts.size >= MAX_CASTS) {
      const oldest = this.casts.keys().next();
      if (!oldest.done) this.casts.delete(oldest.value);
    }
    this.casts.set(guid, { ...entry, relevant });
    this.emit({
      durationMs: entry.durationMs,
      guid,
      kind: entry.kind,
      relevant: relevant ? 1 : 0,
      spellId: entry.spellId,
      spellName: this.nameOf(entry.spellId),
      type: "unit_cast_start",
    });
  }

  end(guid: bigint, spellId: number, outcome: UnitCastOutcome): void {
    const entry = this.casts.get(guid);
    if (!entry || entry.spellId !== spellId) return;
    this.casts.delete(guid);
    this.unsettle(guid);
    this.shortenedEnds.delete(guid);
    this.emit({
      guid,
      outcome,
      relevant: entry.relevant ? 1 : 0,
      spellId,
      spellName: this.nameOf(spellId),
      type: "unit_cast_end",
    });
  }

  expire(guid: bigint): void {
    this.end(guid, this.casts.get(guid)?.spellId ?? 0, "expired");
  }

  settle(guid: bigint, spellId: number, outcome: UnitCastOutcome): void {
    this.unsettle(guid);
    this.settling.set(
      guid,
      setTimeout(() => {
        this.settling.delete(guid);
        this.end(guid, spellId, outcome);
      }, SETTLE_MS),
    );
  }

  drop(guid: bigint): void {
    this.casts.delete(guid);
    this.unsettle(guid);
    this.shortenedEnds.delete(guid);
  }

  noteChannelRemaining(guid: bigint, remainingMs: number): void {
    if (this.casts.get(guid)?.kind !== "channel") return;
    this.shortenedEnds.set(guid, this.deps.now() + remainingMs);
  }

  expectedEndOf(guid: bigint): number | undefined {
    const entry = this.casts.get(guid);
    if (!entry) return undefined;
    return this.shortenedEnds.get(guid) ?? entry.startedAt + entry.durationMs;
  }

  dispose(): void {
    for (const timer of this.settling.values()) clearTimeout(timer);
    this.settling.clear();
    this.shortenedEnds.clear();
  }

  private unsettle(guid: bigint): void {
    const timer = this.settling.get(guid);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.settling.delete(guid);
  }

  private nameOf(spellId: number): string | undefined {
    return this.combat.definition(spellId)?.name;
  }

  private isRelevant(guid: bigint): boolean {
    return guid === selfTarget(this.deps) || this.combat.isAttackingSelf(guid);
  }

  private collectExpired(): void {
    const now = this.deps.now();
    for (const [guid, entry] of [...this.casts]) {
      if (now >= entry.startedAt + entry.durationMs + 1000)
        this.end(guid, entry.spellId, "expired");
    }
  }
}
