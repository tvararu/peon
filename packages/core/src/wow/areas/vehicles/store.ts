import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  MonsterMoveTransport,
  PlayerVehicleData,
} from "#wow/areas/vehicles/protocol";
import { type MonsterMove, SplineFlag } from "#wow/protocol/monster-move";
import type { Vec3 } from "#wow/protocol/packet";
import type { SessionDeps } from "#wow/session-stores";

const UNIT_GUID_HIGH = 0xf130n;
const VEHICLE_GUID_HIGH = 0xf150n;

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
      offset: Vec3;
      splineId: number;
      duration: number;
      flags: number;
    }
  | {
      type: "entered";
      vehicle: bigint;
      seat: number;
      entry: number | undefined;
      offset: Vec3;
      splineId: number | undefined;
      duration: number;
    }
  | { type: "exited"; vehicle: bigint }
  | { type: "seat_changed"; vehicle: bigint; seat: number };

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
    const before = this.seat;
    this.passengers.set(move.guid, {
      seat: move.seat,
      transportGuid: move.transportGuid,
    });
    const offset = splineOffset(move.move);
    this.queue({
      duration: move.move.kind === "move" ? move.move.duration : 0,
      flags: move.move.kind === "move" ? move.move.flags : 0,
      guid: move.guid,
      offset,
      seat: move.seat,
      splineId: move.move.splineId,
      transportGuid: move.transportGuid,
      type: "spline",
    });
    if (move.guid !== this.deps.selfGuid()) return;
    const flags = move.move.kind === "move" ? move.move.flags : 0;
    if (flags & SplineFlag.TRANSPORT_EXIT) return;
    this.setSeat({
      controlling:
        before?.vehicle === move.transportGuid
          ? (before?.controlling ?? false)
          : false,
      entry: this.vehicleEntry(move.transportGuid),
      seat: move.seat,
      vehicle: move.transportGuid,
    });
    if (before?.vehicle === move.transportGuid && before.seat !== move.seat) {
      this.queue({
        seat: move.seat,
        type: "seat_changed",
        vehicle: move.transportGuid,
      });
      return;
    }
    if (before?.vehicle !== move.transportGuid)
      this.queue({
        duration: move.move.kind === "move" ? move.move.duration : 0,
        entry: this.vehicleEntry(move.transportGuid),
        offset,
        seat: move.seat,
        splineId: move.move.splineId,
        type: "entered",
        vehicle: move.transportGuid,
      });
  }

  receiveCreatedOnTransport(
    guid: bigint,
    transport: { guid: bigint; seat: number; x: number; y: number; z: number },
  ): void {
    if (guid !== this.deps.selfGuid()) return;
    const kind = transport.guid >> 48n;
    if (kind !== UNIT_GUID_HIGH && kind !== VEHICLE_GUID_HIGH) return;
    if (this.seat?.vehicle === transport.guid) return;
    const entry = this.vehicleEntry(transport.guid);
    this.passengers.set(guid, {
      seat: transport.seat,
      transportGuid: transport.guid,
    });
    this.setSeat({
      controlling: false,
      entry,
      seat: transport.seat,
      vehicle: transport.guid,
    });
    this.queue({
      duration: 0,
      entry,
      offset: { x: transport.x, y: transport.y, z: transport.z },
      seat: transport.seat,
      splineId: undefined,
      type: "entered",
      vehicle: transport.guid,
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
      offset: splineOffset(move),
      seat: -1,
      splineId: move.splineId,
      transportGuid: seated.transportGuid,
      type: "spline",
    });
    if (guid !== this.deps.selfGuid()) return;
    const vehicle = this.seat?.vehicle ?? seated.transportGuid;
    this.setSeat(undefined);
    this.queue({ type: "exited", vehicle });
  }

  private vehicleEntry(vehicle: bigint): number | undefined {
    const entity = this.deps.getEntity(vehicle);
    if (entity && "entry" in entity) return entity.entry;
    return undefined;
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

function splineOffset(move: MonsterMove): Vec3 {
  if (move.kind !== "move") return { x: 0, y: 0, z: 0 };
  const last = (move.points ?? []).at(-1);
  return last ?? { x: 0, y: 0, z: 0 };
}
