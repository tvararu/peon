import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  DifficultyPacket,
  InstanceDifficulty,
  InstanceOwnership,
  InstanceReset,
  InstanceResetFailed,
  LastInstance,
  LockWarning,
  RaidGroupOnly,
  RaidInstanceMessage,
  RaidLock,
} from "#wow/areas/instances/protocol";
import { type DifficultyKind, difficultyName } from "#wow/protocol/difficulty";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type MapDifficulty = {
  mapId: number;
  difficulty: number;
  dynamicHeroic: boolean;
  name: string | undefined;
};
export type InstanceWarning = RaidInstanceMessage & { at: number };
export type HomebindTimer = { startedAt: number; ms: number };

export type PendingBind = {
  timeoutMs: number;
  encounterMask: number;
  at: number;
  deadline: number;
};

export type PendingDifficulty = { dungeon?: number; raid?: number };
export type DifficultyBody = { kind: DifficultyKind; difficulty: number };

export type InstancesState = {
  dungeonDifficulty: number | undefined;
  raidDifficulty: number | undefined;
  mapDifficulty: MapDifficulty | undefined;
  hasPermanentBinds: boolean | undefined;
  lastInstanceMaps: readonly number[];
  lastWarning: InstanceWarning | undefined;
  homebindTimer: HomebindTimer | undefined;
  locks: readonly RaidLock[] | undefined;
  locksAt: number | undefined;
  pendingBind: PendingBind | undefined;
  pendingDifficulty: PendingDifficulty | undefined;
};

export type InstancesEvent =
  | {
      type: "difficulty";
      kind: DifficultyKind;
      difficulty: number;
      inGroup: boolean;
      previous: number | undefined;
      name: string | undefined;
    }
  | ({ type: "map_difficulty" } & MapDifficulty)
  | { type: "saved_maps"; hasPermanentBinds: boolean; maps: readonly number[] }
  | ({ type: "warning" } & RaidInstanceMessage)
  | {
      type: "homebind_timer";
      state: "started" | "cancelled";
      ms: number;
      code: number;
    }
  | { type: "corpse_elsewhere" }
  | {
      type: "lockouts";
      locks: readonly RaidLock[];
      added: readonly RaidLock[];
      removed: readonly RaidLock[];
    }
  | {
      type: "bind_offer";
      timeoutMs: number;
      encounterMask: number;
      deadline: number;
    }
  | { type: "bound" }
  | { type: "reset"; mapId: number }
  | { type: "reset_failed"; mapId: number; reason: number }
  | { type: "reset_blocked"; mapId: number };

const lockKey = (lock: RaidLock) => `${lock.mapId}:${lock.difficulty}`;

const DIFFICULTY_KEY = {
  dungeon: "dungeonDifficulty",
  raid: "raidDifficulty",
} as const;

const EMPTY: InstancesState = {
  dungeonDifficulty: undefined,
  raidDifficulty: undefined,
  mapDifficulty: undefined,
  hasPermanentBinds: undefined,
  lastInstanceMaps: [],
  lastWarning: undefined,
  homebindTimer: undefined,
  locks: undefined,
  locksAt: undefined,
  pendingBind: undefined,
  pendingDifficulty: undefined,
};

export class InstancesStore {
  private readonly events = new Emitter<[InstancesEvent]>();
  private readonly bodies = new Emitter<[DifficultyBody]>();
  private state: InstancesState = EMPTY;
  private readonly now: () => number;
  private readonly core: CoreStores;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.now = deps.now;
    this.core = core;
  }

  snapshot(): InstancesState {
    const {
      mapDifficulty,
      lastWarning,
      homebindTimer,
      locks,
      pendingBind,
      pendingDifficulty,
    } = this.state;
    return {
      ...this.state,
      locks: locks?.map((lock) => ({ ...lock })),
      pendingBind:
        pendingBind && this.now() < pendingBind.deadline
          ? { ...pendingBind }
          : undefined,
      pendingDifficulty: pendingDifficulty && { ...pendingDifficulty },
      mapDifficulty: mapDifficulty && { ...mapDifficulty },
      lastWarning: lastWarning && { ...lastWarning },
      homebindTimer: homebindTimer && { ...homebindTimer },
    };
  }

  onEvent(cb: (event: InstancesEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  onDifficultyBody(cb: (body: DifficultyBody) => void): Unsubscribe {
    return this.bodies.subscribe(cb);
  }

  pendDifficulty(kind: DifficultyKind, value: number): void {
    this.set({
      pendingDifficulty: { ...this.state.pendingDifficulty, [kind]: value },
    });
  }

  difficulty(kind: DifficultyKind, packet: DifficultyPacket): void {
    const key = DIFFICULTY_KEY[kind];
    const previous = this.state[key];
    const pending = this.state.pendingDifficulty;
    if (pending?.[kind] !== undefined) {
      const next = { ...pending };
      delete next[kind];
      this.set({
        pendingDifficulty:
          next.dungeon === undefined && next.raid === undefined
            ? undefined
            : next,
      });
    }
    if (previous === packet.difficulty) {
      this.bodies.emit({ kind, difficulty: packet.difficulty });
      return;
    }
    this.set({ [key]: packet.difficulty });
    this.bodies.emit({ kind, difficulty: packet.difficulty });
    this.events.emit({
      type: "difficulty",
      kind,
      difficulty: packet.difficulty,
      inGroup: packet.inGroup,
      previous,
      name: difficultyName(kind, packet.difficulty),
    });
  }

  instanceDifficulty(packet: InstanceDifficulty): void {
    const mapDifficulty: MapDifficulty = {
      mapId: this.core.self.mapId,
      difficulty: packet.difficulty,
      dynamicHeroic: packet.dynamicHeroic,
      name: difficultyName("dungeon", packet.difficulty),
    };
    this.set({ mapDifficulty });
    this.events.emit({ type: "map_difficulty", ...mapDifficulty });
  }

  ownership(packet: InstanceOwnership): void {
    this.set({ hasPermanentBinds: packet.hasBinds, lastInstanceMaps: [] });
    this.savedMaps();
  }

  lastInstance(packet: LastInstance): void {
    this.set({
      lastInstanceMaps: [...this.state.lastInstanceMaps, packet.mapId],
    });
    this.savedMaps();
  }

  warning(packet: RaidInstanceMessage): void {
    this.set({ lastWarning: { ...packet, at: this.now() } });
    this.events.emit({ type: "warning", ...packet });
  }

  groupOnly(packet: RaidGroupOnly): void {
    const started = packet.timerMs > 0;
    this.set({
      homebindTimer: started
        ? { startedAt: this.now(), ms: packet.timerMs }
        : undefined,
    });
    this.events.emit({
      type: "homebind_timer",
      state: started ? "started" : "cancelled",
      ms: packet.timerMs,
      code: packet.code,
    });
  }

  corpseElsewhere(): void {
    this.events.emit({ type: "corpse_elsewhere" });
  }

  raidInfo(locks: readonly RaidLock[]): void {
    const before = this.state.locks ?? [];
    const kept = new Set(locks.map(lockKey));
    const had = new Set(before.map(lockKey));
    this.set({ locks, locksAt: this.now() });
    this.events.emit({
      type: "lockouts",
      locks,
      added: locks.filter((lock) => !had.has(lockKey(lock))),
      removed: before.filter((lock) => !kept.has(lockKey(lock))),
    });
  }

  lockWarning(packet: LockWarning): void {
    const at = this.now();
    const deadline = at + packet.timeoutMs;
    this.set({ pendingBind: { ...packet, at, deadline } });
    this.events.emit({ type: "bind_offer", ...packet, deadline });
  }

  saveCreated(): void {
    this.set({ pendingBind: undefined });
    this.events.emit({ type: "bound" });
  }

  reset(packet: InstanceReset): void {
    this.events.emit({ type: "reset", mapId: packet.mapId });
  }

  resetFailed(packet: InstanceResetFailed): void {
    this.events.emit({
      type: "reset_failed",
      mapId: packet.mapId,
      reason: packet.reason,
    });
  }

  resetBlocked(packet: InstanceReset): void {
    this.events.emit({ type: "reset_blocked", mapId: packet.mapId });
  }

  mapChanged(): void {
    this.set({
      mapDifficulty: undefined,
      homebindTimer: undefined,
      pendingBind: undefined,
    });
  }

  dispose(): void {
    this.events.clear();
    this.bodies.clear();
  }

  private set(next: Partial<InstancesState>): void {
    this.state = { ...this.state, ...next };
  }

  private savedMaps(): void {
    this.events.emit({
      type: "saved_maps",
      hasPermanentBinds: this.state.hasPermanentBinds ?? false,
      maps: this.state.lastInstanceMaps,
    });
  }
}

export function createInstancesStore(
  deps: SessionDeps,
  core: CoreStores,
): InstancesStore {
  return new InstancesStore(deps, core);
}
