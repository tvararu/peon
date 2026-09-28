import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  MotionFlagName,
  SplineUnitState,
} from "#wow/areas/unitmotion/protocol";
import { MovementFlag, ObjectType } from "#wow/protocol/entity-fields";
import {
  CREATE_SPEED_ORDER,
  type SpeedKind,
  type Speeds,
} from "#wow/protocol/movement-block";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type SpeedSource = "create" | "spline" | "move_msg";
export type SpeedReading = { value: number; source: SpeedSource; at: number };
export type UnitMovement = {
  guid: bigint;
  flags: number;
  speeds: Readonly<Partial<Record<SpeedKind, SpeedReading>>>;
  runBefore: number | undefined;
  serverControlled: boolean;
  updatedAt: number;
};
export type UnitmotionState = {
  units: readonly UnitMovement[];
  dropped: number;
};
export type UnitmotionEvent =
  | {
      type: "speed";
      guid: bigint;
      kind: SpeedKind;
      value: number;
      previous: number | undefined;
      self: boolean;
    }
  | {
      type: "flag";
      guid: bigint;
      flag: MotionFlagName;
      on: boolean;
      flags: number;
      self: boolean;
    }
  | { type: "removed"; guid: bigint; self: boolean };

export const BASE_SPEEDS: Speeds = {
  walk: 2.5,
  run: 7,
  run_back: 4.5,
  swim: 4.722_222,
  swim_back: 2.5,
  flight: 7,
  flight_back: 4.5,
  turn: 3.141_594,
  pitch: 3.14,
};

const ROOT_CLEARS =
  MovementFlag.FORWARD |
  MovementFlag.BACKWARD |
  MovementFlag.STRAFE_LEFT |
  MovementFlag.STRAFE_RIGHT |
  MovementFlag.PITCH_UP |
  MovementFlag.PITCH_DOWN |
  MovementFlag.FALLING |
  MovementFlag.FALLING_FAR |
  MovementFlag.ASCENDING |
  MovementFlag.DESCENDING |
  MovementFlag.SPLINE_ELEVATION |
  MovementFlag.FLYING;

type Row = {
  flags: number;
  speeds: Partial<Record<SpeedKind, SpeedReading>>;
  runBefore: number | undefined;
  serverControlled: boolean;
  updatedAt: number;
};

type SpeedChange = {
  guid: bigint;
  kind: SpeedKind;
  value: number;
  source: SpeedSource;
};
type FlagChange = Extract<SplineUnitState, { kind: "flag" }>;

function runBeforeOf(row: Row, next: number): number | undefined {
  const before = row.runBefore ?? row.speeds.run?.value;
  if (before === undefined || next >= before) return undefined;
  return before;
}

export class UnitmotionStore {
  private readonly events = new Emitter<[UnitmotionEvent]>();
  private readonly rows = new Map<bigint, Row>();
  private readonly deps: SessionDeps;
  private dropped = 0;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.deps = deps;
  }

  snapshot(): UnitmotionState {
    return {
      units: [...this.rows].map(([guid, row]) => ({
        guid,
        flags: row.flags,
        speeds: { ...row.speeds },
        runBefore: row.runBefore,
        serverControlled: row.serverControlled,
        updatedAt: row.updatedAt,
      })),
      dropped: this.dropped,
    };
  }

  onEvent(cb: (event: UnitmotionEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  seed(guid: bigint, init: { flags: number; speeds: Speeds }): void {
    const at = this.deps.now();
    const speeds: Row["speeds"] = {};
    for (const kind of CREATE_SPEED_ORDER)
      speeds[kind] = { value: init.speeds[kind], source: "create", at };
    const player = this.deps.getEntity(guid)?.objectType === ObjectType.PLAYER;
    this.rows.set(guid, {
      flags: init.flags,
      speeds,
      runBefore: undefined,
      serverControlled: !player,
      updatedAt: at,
    });
  }

  receiveSpline(state: SplineUnitState): void {
    const row = this.rowFor(state.guid);
    if (!row) return;
    row.serverControlled = true;
    if (state.kind === "speed")
      this.setSpeed(row, {
        guid: state.guid,
        kind: state.speed,
        value: state.value,
        source: "spline",
      });
    else this.setFlag(row, state);
  }

  receiveMoveSpeed(guid: bigint, kind: SpeedKind, value: number): void {
    const row = this.rowFor(guid);
    if (!row) return;
    row.serverControlled = false;
    this.setSpeed(row, { guid, kind, value, source: "move_msg" });
  }

  forget(guid: bigint): void {
    if (!this.rows.delete(guid)) return;
    this.events.emit({ type: "removed", guid, self: this.isSelf(guid) });
  }

  ratio(guid: bigint, kind: SpeedKind): number | undefined {
    const value = this.rows.get(guid)?.speeds[kind]?.value;
    return value === undefined ? undefined : value / BASE_SPEEDS[kind];
  }

  dispose(): void {
    this.events.clear();
    this.rows.clear();
  }

  private isSelf(guid: bigint): boolean {
    return guid === this.deps.selfGuid();
  }

  private rowFor(guid: bigint): Row | undefined {
    const known = this.rows.get(guid);
    if (known) return known;
    if (!this.deps.getEntity(guid)) {
      this.dropped++;
      return undefined;
    }
    const row: Row = {
      flags: 0,
      speeds: {},
      runBefore: undefined,
      serverControlled: true,
      updatedAt: this.deps.now(),
    };
    this.rows.set(guid, row);
    return row;
  }

  private setSpeed(row: Row, { guid, kind, value, source }: SpeedChange): void {
    const at = this.deps.now();
    const previous = row.speeds[kind]?.value;
    if (kind === "run") row.runBefore = runBeforeOf(row, value);
    row.speeds[kind] = { value, source, at };
    row.updatedAt = at;
    this.events.emit({
      type: "speed",
      guid,
      kind,
      value,
      previous,
      self: this.isSelf(guid),
    });
  }

  private setFlag(row: Row, { guid, flag, bit, on }: FlagChange): void {
    const cleared =
      on && flag === "root" ? row.flags & ~ROOT_CLEARS : row.flags;
    row.flags = (on ? cleared | bit : cleared & ~bit) >>> 0;
    row.updatedAt = this.deps.now();
    this.events.emit({
      type: "flag",
      guid,
      flag,
      on,
      flags: row.flags,
      self: this.isSelf(guid),
    });
  }
}
