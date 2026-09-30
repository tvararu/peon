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

export const vehiclesHarness = defineHarnessArea({
  area: "vehicles",
  rules: () => ({
    event: (event: VehiclesEvent) => {
      if (event.type === "player_vehicle") return [playerVehicleRow(event)];
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
  worldActs: [],
});
