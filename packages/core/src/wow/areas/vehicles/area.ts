import { type AreaRegister, defineArea } from "#wow/areas/contract";
import { VEHICLES_OPCODES } from "#wow/areas/vehicles/opcodes";
import {
  parseMonsterMoveTransport,
  parsePlayerVehicleData,
} from "#wow/areas/vehicles/protocol";
import { vehiclesRuntime } from "#wow/areas/vehicles/runtime";
import { VehiclesStore } from "#wow/areas/vehicles/store";
import { inflateCompressedUpdate } from "#wow/protocol/compressed-update";
import { UpdateFlag } from "#wow/protocol/entity-fields";
import { parseMonsterMove } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import { parseUpdateObject } from "#wow/protocol/update-object";

function observeUpdates(store: VehiclesStore, r: PacketReader): void {
  const entries = parseUpdateObject(r, 0);
  for (const entry of entries) {
    if (entry.type === "outOfRange") {
      for (const guid of entry.guids) store.removeVehicleId(guid);
    } else if (entry.type === "create" && entry.movementInfo?.transport) {
      store.receiveCreatedOnTransport(entry.guid, entry.movementInfo.transport);
    }
    if (
      (entry.type === "create" || entry.type === "movement") &&
      entry.updateFlags & UpdateFlag.VEHICLE &&
      entry.vehicle
    ) {
      store.setVehicleId(entry.guid, entry.vehicle.id);
      store.recordMotion(entry.guid, {
        flags: entry.movementInfo?.flags,
        pose: entry.position,
        run: entry.runSpeed,
        runBack: entry.runBackSpeed,
        turn: entry.turnRate,
      });
    }
  }
}

export const vehiclesArea = defineArea({
  eventTypes: [
    "control",
    "entered",
    "exited",
    "player_vehicle",
    "ride_aura_cancel",
    "seat_changed",
    "spline",
  ],
  name: "vehicles",
  opcodes: VEHICLES_OPCODES,
  register: (wire: AreaRegister, store: VehiclesStore) => {
    wire.on(GameOpcode.SMSG_PLAYER_VEHICLE_DATA, (r) =>
      store.receivePlayerVehicle(parsePlayerVehicleData(r)),
    );
    wire.on(GameOpcode.SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA, () =>
      store.receiveRideAuraCancel(),
    );
    wire.on(GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT, (r) =>
      store.receiveTransport(parseMonsterMoveTransport(r)),
    );
    wire.peek(GameOpcode.SMSG_MONSTER_MOVE, (r) => {
      const move = parseMonsterMove(r);
      store.receiveExit(move.guid, move);
    });
    wire.peek(GameOpcode.SMSG_UPDATE_OBJECT, (r) => observeUpdates(store, r));
    wire.peek(GameOpcode.SMSG_COMPRESSED_UPDATE_OBJECT, (r) =>
      observeUpdates(store, inflateCompressedUpdate(r)),
    );
    wire.peek(GameOpcode.SMSG_DESTROY_OBJECT, (r) =>
      store.removeVehicleId(r.uint64LE()),
    );
  },
  runtime: (ctx, store, core) => vehiclesRuntime(ctx, store, core),
  store: (deps) => new VehiclesStore(deps),
});
