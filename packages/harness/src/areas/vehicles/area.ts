import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type VehiclesEvent = AreaEventOf<"vehicles">;

function playerVehicleRow(
  event: Extract<VehiclesEvent, { type: "player_vehicle" }>,
): AreaDraft {
  return {
    class: "log",
    data: {
      guid: `0x${event.guid.toString(16)}`,
      vehicleId: event.vehicleId,
    },
    name: "player_vehicle",
    text:
      event.vehicleId === 0
        ? "The unit is no longer a vehicle."
        : `The unit became vehicle ${event.vehicleId}.`,
  };
}

function hex(guid: bigint): string {
  return `0x${guid.toString(16)}`;
}

function seatText(seat: number, entry: number | undefined): string {
  return entry === undefined
    ? `seat ${seat} of a vehicle`
    : `seat ${seat} of vehicle ${entry}`;
}

function enteredRow(
  event: Extract<VehiclesEvent, { type: "entered" }>,
): AreaDraft {
  return {
    class: "wake",
    data: {
      entry: event.entry,
      seat: event.seat,
      vehicle: hex(event.vehicle),
    },
    name: "entered",
    text: `You sit in ${seatText(event.seat, event.entry)}.`,
  };
}

export const vehiclesHarness = defineHarnessArea({
  area: "vehicles",
  rules: () => ({
    attach: (state) =>
      state.seat
        ? [
            {
              class: "log",
              data: {
                entry: state.seat.entry,
                seat: state.seat.seat,
                vehicle: hex(state.seat.vehicle),
              },
              name: "seated",
              text: `You are in ${seatText(state.seat.seat, state.seat.entry)}.`,
            } satisfies AreaDraft,
          ]
        : [],
    event: (event: VehiclesEvent) => {
      if (event.type === "player_vehicle") return [playerVehicleRow(event)];
      if (event.type === "entered") return [enteredRow(event)];
      if (event.type === "exited")
        return [
          {
            class: "log",
            data: { vehicle: hex(event.vehicle) },
            name: "exited",
            text: "You left the vehicle seat.",
          } satisfies AreaDraft,
        ];
      if (event.type === "seat_changed")
        return [
          {
            class: "log",
            data: { seat: event.seat, vehicle: hex(event.vehicle) },
            name: "seat_changed",
            text: `You moved to seat ${event.seat}.`,
          } satisfies AreaDraft,
        ];
      if (event.type === "ride_aura_cancel")
        return [
          {
            class: "log",
            data: {},
            name: "ride_aura_cancel",
            text: "The server cancelled the expected ride aura.",
          } satisfies AreaDraft,
        ];
      return [];
    },
  }),
  worldActs: [
    "spellClick",
    "exitVehicle",
    "nextSeat",
    "prevSeat",
    "switchSeat",
    "enterPlayerVehicle",
    "ejectPassenger",
  ],
});
