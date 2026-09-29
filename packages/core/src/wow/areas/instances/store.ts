import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  DifficultyPacket,
  InstanceDifficulty,
  InstanceOwnership,
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
  | { type: "bound" };

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
};

export class InstancesStore {
  private readonly events = new Emitter<[InstancesEvent]>();
  private state: InstancesState = EMPTY;
  private readonly now: () => number;
  private readonly core: CoreStores;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.now = deps.now;
    this.core = core;
  }

  snapshot(): InstancesState {
    const { mapDifficulty, lastWarning, homebindTimer, locks, pendingBind } =
      this.state;
    return {
      ...this.state,
      locks: locks?.map((lock) => ({ ...lock })),
      pendingBind:
        pendingBind && this.now() < pendingBind.deadline
          ? { ...pendingBind }
          : undefined,
      mapDifficulty: mapDifficulty && { ...mapDifficulty },
      lastWarning: lastWarning && { ...lastWarning },
      homebindTimer: homebindTimer && { ...homebindTimer },
    };
  }

  onEvent(cb: (event: InstancesEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  difficulty(kind: DifficultyKind, packet: DifficultyPacket): void {
    const key = DIFFICULTY_KEY[kind];
    const previous = this.state[key];
    if (previous === packet.difficulty) return;
    this.set({ [key]: packet.difficulty });
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

  mapChanged(): void {
    this.set({
      mapDifficulty: undefined,
      homebindTimer: undefined,
      pendingBind: undefined,
    });
  }

  dispose(): void {
    this.events.clear();
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
