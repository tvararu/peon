import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { LfgPlayerInfo, LfgUpdate } from "#wow/areas/lfg/protocol";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type LfgStatus = "none" | "queued" | "proposal";
export type LfgUpdateSource = "player" | "party" | "search";
export type LfgLockReason =
  | "none"
  | "insufficient_expansion"
  | "too_low_level"
  | "too_high_level"
  | "too_low_gear_score"
  | "too_high_gear_score"
  | "raid_locked"
  | "attunement_too_low_level"
  | "attunement_too_high_level"
  | "quest_not_completed"
  | "missing_item"
  | "not_in_season"
  | "missing_achievement"
  | "unknown";

export type LfgLockView = {
  entry: number;
  id: number;
  type: number;
  status: number;
  reason: LfgLockReason;
};
export type LfgRandomView = { entry: number; id: number };
export type LfgPartyLocks = {
  guid: bigint;
  locks: readonly LfgLockView[];
};

export type LfgState = {
  status: LfgStatus;
  selected: readonly number[];
  comment: string;
  searching: boolean;
  available: readonly LfgRandomView[];
  locks: readonly LfgLockView[];
  locksAt: number | undefined;
  partyLocks: readonly LfgPartyLocks[];
  partyLocksAt: number | undefined;
};

export type LfgEvent =
  | {
      type: "status";
      status: LfgStatus;
      previous: LfgStatus;
      source: LfgUpdateSource;
      updateType: number;
    }
  | { type: "dungeons"; scope: "player" | "party" };

const LOCK_REASONS: Readonly<Record<number, LfgLockReason>> = {
  0: "none",
  1: "insufficient_expansion",
  2: "too_low_level",
  3: "too_high_level",
  4: "too_low_gear_score",
  5: "too_high_gear_score",
  6: "raid_locked",
  1001: "attunement_too_low_level",
  1002: "attunement_too_high_level",
  1022: "quest_not_completed",
  1025: "missing_item",
  1031: "not_in_season",
  1034: "missing_achievement",
};

export function lockReason(status: number): LfgLockReason {
  return LOCK_REASONS[status] ?? "unknown";
}

export function lockView(entry: number, status: number): LfgLockView {
  return {
    entry,
    id: entry & 0x00_ff_ff_ff,
    type: (entry >>> 24) & 0xff,
    status,
    reason: lockReason(status),
  };
}

const RAID_BROWSER_JOIN = 3;
const ROLECHECK_ABORT = 4;
const JOIN_QUEUE = 5;
const ROLECHECK_FAIL = 6;
const REMOVED_FROM_QUEUE = 7;
const PROPOSAL_FAIL = 8;
const PROPOSAL_DECLINED = 9;
const JOIN_RAIDBROWSER = 2;
const ADDED_TO_QUEUE = 12;
const PROPOSAL_BEGIN = 13;
const UPDATE_STATUS = 14;

function statusOf(updateType: number, queued: boolean): LfgStatus | "keep" {
  switch (updateType) {
    case JOIN_QUEUE:
    case ADDED_TO_QUEUE:
      return "queued";
    case ROLECHECK_ABORT:
    case ROLECHECK_FAIL:
    case REMOVED_FROM_QUEUE:
    case PROPOSAL_FAIL:
    case PROPOSAL_DECLINED:
      return "none";
    case PROPOSAL_BEGIN:
      return "proposal";
    case UPDATE_STATUS:
      return queued ? "queued" : "keep";
    case RAID_BROWSER_JOIN:
      return "keep";
    case JOIN_RAIDBROWSER:
      return "keep";
    default:
      return "keep";
  }
}

const EMPTY: LfgState = {
  status: "none",
  selected: [],
  comment: "",
  searching: false,
  available: [],
  locks: [],
  locksAt: undefined,
  partyLocks: [],
  partyLocksAt: undefined,
};

export class LfgStore {
  private readonly events = new Emitter<[LfgEvent]>();
  private state: LfgState = EMPTY;
  private readonly now: () => number;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
  }

  snapshot(): LfgState {
    return {
      ...this.state,
      selected: [...this.state.selected],
      available: this.state.available.map((d) => ({ ...d })),
      locks: this.state.locks.map((l) => ({ ...l })),
      partyLocks: this.state.partyLocks.map((p) => ({
        guid: p.guid,
        locks: p.locks.map((l) => ({ ...l })),
      })),
    };
  }
  onEvent(cb: (event: LfgEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveUpdate(update: LfgUpdate, source: "player" | "party"): void {
    const next = statusOf(update.updateType, update.queued);
    const previous = this.state.status;
    if (next === "keep") {
      this.events.emit({
        type: "status",
        status: previous,
        previous,
        source,
        updateType: update.updateType,
      });
      return;
    }
    this.set({
      status: next,
      selected: next === "none" ? [] : [...update.dungeons],
      comment: next === "none" ? "" : update.comment,
    });
    this.events.emit({
      type: "status",
      status: next,
      previous,
      source,
      updateType: update.updateType,
    });
  }


  receivePlayerInfo(info: LfgPlayerInfo): void {
    this.set({
      available: info.random.map((d) => ({
        entry: d.entry,
        id: d.entry & 0x00_ff_ff_ff,
      })),
      locks: info.locks.map((l) => lockView(l.entry, l.status)),
      locksAt: this.now(),
    });
    this.events.emit({ type: "dungeons", scope: "player" });
  }

  receivePartyInfo(players: readonly { guid: bigint; locks: readonly { entry: number; status: number }[] }[]): void {
    this.set({
      partyLocks: players.map((p) => ({
        guid: p.guid,
        locks: p.locks.map((l) => lockView(l.entry, l.status)),
      })),
      partyLocksAt: this.now(),
    });
    this.events.emit({ type: "dungeons", scope: "party" });
  }

  receiveSearch(on: boolean): void {
    if (this.state.searching === on) return;
    const previous = this.state.status;
    this.set({ searching: on });
    this.events.emit({
      type: "status",
      status: previous,
      previous,
      source: "search",
      updateType: on ? 3 : 2,
    });
  }

  dispose(): void {
    this.events.clear();
  }

  private set(next: Partial<LfgState>): void {
    this.state = { ...this.state, ...next };
  }
}

export function createLfgStore(deps: SessionDeps, core: CoreStores): LfgStore {
  return new LfgStore(deps, core);
}
