import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  type FactionCatalog,
  type FactionEntry,
  rankBounds,
  rankOf,
} from "#wow/areas/reputation/catalog";
import type {
  InitializeFactions,
  SetFactionStanding,
  SetFactionVisible,
  SetForcedReactions,
} from "#wow/areas/reputation/protocol";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const FACTION_FLAGS = {
  VISIBLE: 0x01,
  AT_WAR: 0x02,
  HIDDEN: 0x04,
  INVISIBLE_FORCED: 0x08,
  PEACE_FORCED: 0x10,
  INACTIVE: 0x20,
  RIVAL: 0x40,
  SPECIAL: 0x80,
} as const;

const REP_HOSTILE = 1;
const REP_UNFRIENDLY = 2;
const NO_WATCHED = 0xff_ff_ff_ff;

export type ReputationRow = {
  repListId: number;
  factionId: number | undefined;
  name: string | undefined;
  standing: number;
  rank: number | undefined;
  rankFloor: number | undefined;
  rankCeiling: number | undefined;
  atWar: boolean;
  inactive: boolean;
  visible: boolean;
  watched: boolean;
  changedAt: number | undefined;
};

export type ForcedReactionRow = {
  factionId: number;
  name: string | undefined;
  rank: number;
};

export type ReputationState = {
  factions: readonly ReputationRow[];
  forced: readonly ForcedReactionRow[];
  watched: number | undefined;
  catalog: boolean;
};

export type ReputationEvent =
  | { type: "initialized"; count: number; visible: number }
  | {
      type: "standing_changed";
      repListId: number;
      factionId: number | undefined;
      name: string | undefined;
      before: number;
      after: number;
      rank: number | undefined;
      rankChanged: boolean;
      increased: boolean;
      atWar: boolean;
      wasAtWar: boolean;
    }
  | { type: "visible"; repListId: number; name: string | undefined }
  | {
      type: "forced_changed";
      added: readonly ForcedReactionRow[];
      removed: readonly ForcedReactionRow[];
    }
  | {
      type: "watched_changed";
      repListId: number | undefined;
      name: string | undefined;
    }
  | {
      type: "flags_pending";
      repListId: number;
      name: string | undefined;
      atWar?: boolean;
      inactive?: boolean;
    };

export type SettingFlag = "atWar" | "inactive";

const SETTING_BITS = {
  atWar: FACTION_FLAGS.AT_WAR,
  inactive: FACTION_FLAGS.INACTIVE,
} as const satisfies Record<SettingFlag, number>;

type Stored = {
  flags: number;
  delta: number;
  inferred: Map<number, boolean>;
  changedAt: number | undefined;
};

export class ReputationStore {
  private readonly events = new Emitter<[ReputationEvent]>();
  private readonly factions = new Map<number, Stored>();
  private readonly pending = new Map<number, Map<number, boolean>>();
  private forced = new Map<number, number>();
  private readonly now: () => number;
  private catalog: FactionCatalog | undefined;
  private character: { raceMask: number; classMask: number } | undefined;
  private watched: number | undefined;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
  }

  snapshot(): ReputationState {
    return {
      factions: this.list(),
      forced: this.forcedRows(this.forced),
      watched: this.watched,
      catalog: this.catalog !== undefined,
    };
  }

  onEvent(cb: (event: ReputationEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  setCatalog(catalog: FactionCatalog): void {
    this.catalog = catalog;
  }

  setCharacter(raceMask: number, classMask: number): void {
    this.character = { raceMask, classMask };
  }

  initialize(packet: InitializeFactions): void {
    this.factions.clear();
    this.pending.clear();
    let visible = 0;
    packet.entries.forEach(({ flags, standing }, repListId) => {
      if (flags === 0 && standing === 0) return;
      this.factions.set(repListId, {
        flags,
        delta: standing,
        inferred: new Map(),
        changedAt: undefined,
      });
      if (flags & FACTION_FLAGS.VISIBLE) visible++;
    });
    this.events.emit({
      type: "initialized",
      count: this.factions.size,
      visible,
    });
  }

  setStanding(packet: SetFactionStanding): void {
    for (const { repListId, standing } of packet.entries)
      this.applyStanding(repListId, standing, packet.increased);
  }

  setVisible(packet: SetFactionVisible): void {
    const stored = this.stored(packet.repListId);
    stored.flags |= FACTION_FLAGS.VISIBLE;
    stored.changedAt = this.now();
    this.events.emit({
      type: "visible",
      repListId: packet.repListId,
      name: this.faction(packet.repListId)?.name,
    });
  }

  setForced(packet: SetForcedReactions): void {
    const next = new Map(
      packet.reactions.map(({ factionId, rank }) => [factionId, rank]),
    );
    const added = new Map(
      [...next].filter(([id, rank]) => this.forced.get(id) !== rank),
    );
    const removed = new Map(
      [...this.forced].filter(([id, rank]) => next.get(id) !== rank),
    );
    this.forced = next;
    if (added.size === 0 && removed.size === 0) return;
    this.events.emit({
      type: "forced_changed",
      added: this.forcedRows(added),
      removed: this.forcedRows(removed),
    });
  }

  forcedRank(factionId: number): number | undefined {
    return this.forced.get(factionId);
  }

  factionRank(factionId: number): number | undefined {
    const repListId = this.catalog?.byFactionId(factionId)?.repListId;
    if (repListId === undefined) return undefined;
    return this.rankAt(repListId, this.factions.get(repListId)?.delta ?? 0);
  }

  factionAtWar(factionId: number): boolean {
    const repListId = this.catalog?.byFactionId(factionId)?.repListId;
    const flags = repListId === undefined ? undefined : this.flagsOf(repListId);
    return flags !== undefined && (flags & FACTION_FLAGS.AT_WAR) !== 0;
  }

  flagsOf(repListId: number): number | undefined {
    const stored = this.factions.get(repListId);
    return stored && this.effectiveFlags(repListId, stored);
  }

  setPendingFlag(repListId: number, flag: SettingFlag, on: boolean): void {
    this.stored(repListId);
    const bits = this.pending.get(repListId) ?? new Map<number, boolean>();
    bits.set(SETTING_BITS[flag], on);
    this.pending.set(repListId, bits);
    this.events.emit({
      type: "flags_pending",
      repListId,
      name: this.faction(repListId)?.name,
      [flag]: on,
    });
  }

  receiveWatched(value: number): void {
    const next = value === NO_WATCHED ? undefined : value;
    if (next === this.watched) return;
    this.watched = next;
    this.events.emit({
      type: "watched_changed",
      repListId: next,
      name: next === undefined ? undefined : this.faction(next)?.name,
    });
  }

  list(options: { visibleOnly?: boolean } = {}): ReputationRow[] {
    const rows = [...this.factions.keys()].map((id) => this.row(id));
    const kept = options.visibleOnly ? rows.filter((r) => r.visible) : rows;
    return kept.sort(
      (a, b) =>
        (b.changedAt ?? -1) - (a.changedAt ?? -1) || a.repListId - b.repListId,
    );
  }

  standing(repListId: number): number | undefined {
    const stored = this.factions.get(repListId);
    return stored && this.full(repListId, stored.delta);
  }

  rank(repListId: number): number | undefined {
    const stored = this.factions.get(repListId);
    return stored && this.rankAt(repListId, stored.delta);
  }

  clear(): void {
    this.factions.clear();
    this.pending.clear();
    this.forced = new Map();
    this.watched = undefined;
    this.character = undefined;
  }

  dispose(): void {
    this.events.clear();
    this.clear();
  }

  private applyStanding(
    repListId: number,
    delta: number,
    increased: boolean,
  ): void {
    const stored = this.stored(repListId);
    const oldRank = this.rankAt(repListId, stored.delta);
    const before = this.full(repListId, stored.delta);
    const wasAtWar =
      (this.effectiveFlags(repListId, stored) & FACTION_FLAGS.AT_WAR) !== 0;
    stored.delta = delta;
    stored.changedAt = this.now();
    const rank = this.rankAt(repListId, delta);
    this.inferAtWar(repListId, stored, oldRank, rank);
    const faction = this.faction(repListId);
    this.events.emit({
      type: "standing_changed",
      repListId,
      factionId: faction?.id,
      name: faction?.name,
      before,
      after: this.full(repListId, delta),
      rank,
      rankChanged:
        oldRank !== undefined && rank !== undefined && oldRank !== rank,
      increased,
      atWar:
        (this.effectiveFlags(repListId, stored) & FACTION_FLAGS.AT_WAR) !== 0,
      wasAtWar,
    });
  }

  private inferAtWar(
    repListId: number,
    stored: Stored,
    oldRank: number | undefined,
    rank: number | undefined,
  ): void {
    if (oldRank === undefined || rank === undefined) return;
    if (rank <= REP_HOSTILE) {
      if ((stored.flags & FACTION_FLAGS.PEACE_FORCED) === 0)
        stored.inferred.set(FACTION_FLAGS.AT_WAR, true);
      return;
    }
    const faction = this.faction(repListId);
    if (
      oldRank <= REP_HOSTILE &&
      rank >= REP_UNFRIENDLY &&
      faction &&
      this.catalog?.canBeSetAtWar(faction)
    )
      stored.inferred.set(FACTION_FLAGS.AT_WAR, false);
  }

  private forcedRows(reactions: Map<number, number>): ForcedReactionRow[] {
    return [...reactions]
      .sort(([a], [b]) => a - b)
      .map(([factionId, rank]) => ({
        factionId,
        name: this.catalog?.byFactionId(factionId)?.name,
        rank,
      }));
  }

  private stored(repListId: number): Stored {
    const existing = this.factions.get(repListId);
    if (existing) return existing;
    const created: Stored = {
      flags: 0,
      delta: 0,
      inferred: new Map(),
      changedAt: undefined,
    };
    this.factions.set(repListId, created);
    return created;
  }

  private effectiveFlags(repListId: number, stored: Stored): number {
    let flags = stored.flags;
    for (const [flag, on] of this.pending.get(repListId) ?? [])
      flags = on ? flags | flag : flags & ~flag;
    for (const [flag, on] of stored.inferred)
      flags = on ? flags | flag : flags & ~flag;
    return flags;
  }

  private faction(repListId: number): FactionEntry | undefined {
    return this.catalog?.byRepListId(repListId);
  }

  private base(repListId: number): number | undefined {
    const faction = this.faction(repListId);
    if (!(faction && this.catalog && this.character)) return undefined;
    const { raceMask, classMask } = this.character;
    return this.catalog.baseReputation(faction, raceMask, classMask);
  }

  private full(repListId: number, delta: number): number {
    return (this.base(repListId) ?? 0) + delta;
  }

  private rankAt(repListId: number, delta: number): number | undefined {
    const base = this.base(repListId);
    return base === undefined ? undefined : rankOf(base + delta);
  }

  private row(repListId: number): ReputationRow {
    const stored = this.stored(repListId);
    const flags = this.effectiveFlags(repListId, stored);
    const faction = this.faction(repListId);
    const rank = this.rankAt(repListId, stored.delta);
    const bounds = rank === undefined ? undefined : rankBounds(rank);
    return {
      repListId,
      factionId: faction?.id,
      name: faction?.name,
      standing: this.full(repListId, stored.delta),
      rank,
      rankFloor: bounds?.floor,
      rankCeiling: bounds?.ceiling,
      atWar: (flags & FACTION_FLAGS.AT_WAR) !== 0,
      inactive: (flags & FACTION_FLAGS.INACTIVE) !== 0,
      visible: (flags & FACTION_FLAGS.VISIBLE) !== 0,
      watched: this.watched === repListId,
      changedAt: stored.changedAt,
    };
  }
}
