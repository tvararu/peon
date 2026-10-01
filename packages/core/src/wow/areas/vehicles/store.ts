import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  MonsterMoveTransport,
  PlayerVehicleData,
} from "#wow/areas/vehicles/protocol";
import { type MonsterMove, SplineFlag } from "#wow/protocol/monster-move";
import type { SessionDeps } from "#wow/session-stores";

export type VehicleSeat = {
  vehicle: bigint;
  seat: number;
  entry: number | undefined;
  controlling: boolean;
};

export type VehiclesEvent =
  | { type: "player_vehicle"; guid: bigint; vehicleId: number }
  | { type: "ride_aura_cancel" }
  | {
      type: "spline";
      guid: bigint;
      transportGuid: bigint;
      seat: number;
      splineId: number;
      duration: number;
      flags: number;
    };

export type VehiclesState = {
  seat: VehicleSeat | undefined;
  vehicleIds: ReadonlyMap<bigint, number>;
  passengers: ReadonlyMap<bigint, { transportGuid: bigint; seat: number }>;
};

export class VehiclesStore {
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  entityOf(guid: bigint) {
    return this.deps.getEntity(guid);
  }
  private readonly events = new Emitter<[VehiclesEvent]>();
  private readonly pending: VehiclesEvent[] = [];
  private emitting = false;
  private readonly vehicleIds = new Map<bigint, number>();
  private readonly passengers = new Map<
    bigint,
    { transportGuid: bigint; seat: number }
  >();

  snapshot(): VehiclesState {
    return {
      passengers: new Map(this.passengers),
      seat: this.seat ? { ...this.seat } : undefined,
      vehicleIds: new Map(this.vehicleIds),
    };
  }

  setSeat(seat: VehicleSeat | undefined): void {
    this.seat = seat ? { ...seat } : undefined;
  }

  private seat: VehicleSeat | undefined;

  onEvent(cb: (event: VehiclesEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receivePlayerVehicle(data: PlayerVehicleData): void {
    if (data.vehicleId === 0) this.vehicleIds.delete(data.guid);
    else this.vehicleIds.set(data.guid, data.vehicleId);
    this.queue({
      guid: data.guid,
      type: "player_vehicle",
      vehicleId: data.vehicleId,
    });
  }

  receiveRideAuraCancel(): void {
    this.queue({ type: "ride_aura_cancel" });
  }

  receiveTransport(move: MonsterMoveTransport): void {
    this.passengers.set(move.guid, {
      seat: move.seat,
      transportGuid: move.transportGuid,
    });
    this.queue({
      duration: move.move.kind === "move" ? move.move.duration : 0,
      flags: move.move.kind === "move" ? move.move.flags : 0,
      guid: move.guid,
      seat: move.seat,
      splineId: move.move.splineId,
      transportGuid: move.transportGuid,
      type: "spline",
    });
  }

  receiveExit(guid: bigint, move: MonsterMove): void {
    if (move.kind !== "move" || !(move.flags & SplineFlag.TRANSPORT_EXIT))
      return;
    const seated = this.passengers.get(guid);
    if (!seated) return;
    this.passengers.delete(guid);
    this.queue({
      duration: move.duration,
      flags: move.flags,
      guid,
      seat: -1,
      splineId: move.splineId,
      transportGuid: seated.transportGuid,
      type: "spline",
    });
  }

  setVehicleId(guid: bigint, vehicleId: number): void {
    this.vehicleIds.set(guid, vehicleId);
  }

  removeVehicleId(guid: bigint): void {
    this.vehicleIds.delete(guid);
    this.passengers.delete(guid);
  }

  dispose(): void {
    this.events.clear();
    this.vehicleIds.clear();
    this.passengers.clear();
    this.seat = undefined;
  }

  private queue(event: VehiclesEvent): void {
    if (this.emitting) {
      this.pending.push(event);
      return;
    }
    this.emitting = true;
    try {
      this.events.emit(event);
      let next = this.pending.shift();
      while (next) {
        this.events.emit(next);
        next = this.pending.shift();
      }
    } finally {
      this.emitting = false;
    }
  }
}
