import { StringEnum, Type } from "@earendil-works/pi-ai";
import { vehicleRun } from "#harness/areas/vehicles/tool-run";
import type { VehicleAfter } from "#harness/areas/vehicles/tool-types";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const vehicleParams = Type.Object({
  do: StringEnum(["board", "leave", "seat", "ride_with", "eject"], {
    description:
      "board: walk to a unit and click it to take a seat. leave: get out of your seat. seat: move to the next, the previous or a numbered seat. ride_with: ask to join the vehicle of a player. eject: remove a passenger from your vehicle.",
  }),
  player: Type.Optional(
    Type.String({
      description: 'For ride_with: a player name or a ref like "u3" from look.',
    }),
  ),
  seat: Type.Optional(
    Type.Union(
      [StringEnum(["next", "prev"]), Type.Integer({ maximum: 7, minimum: 0 })],
      {
        description: 'For seat: "next", "prev" or a seat number from 0 to 7.',
      },
    ),
  ),
  unit: Type.Optional(
    Type.String({
      description:
        'For board and eject: a unit name or a ref like "u3" from look.',
    }),
  ),
});

function vehicleCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do"),
      argText(args, "unit") ?? argText(args, "player") ?? argText(args, "seat"),
    ],
    theme,
    verb: "vehicle",
  });
}

function vehicleBody({
  expanded,
  result: out,
}: BodyInit<VehicleAfter>): string[] {
  return expanded ? out.body : [];
}

const vehicleRenderers: ToolRenderers<"vehicle", VehicleAfter> = {
  renderCall: callRenderer(vehicleCall),
  renderResult: resultRenderer("vehicle", vehicleBody),
};

export const vehicleSpec: GameToolSpec<
  typeof vehicleParams,
  "vehicle",
  VehicleAfter
> = {
  fallback: () => ({ do: "leave", target: undefined }),
  kind: "action",
  minimalArgs: { do: "leave" },
  name: "vehicle",
  parameters: vehicleParams,
  renderers: vehicleRenderers,
  run: vehicleRun as GameToolSpec<
    typeof vehicleParams,
    "vehicle",
    VehicleAfter
  >["run"],
  text: {
    description:
      "Use a vehicle: walk to a unit and take its seat, leave the seat, change seats, ride with a player or remove a passenger. The game does not tell you which seats exist, so a request the seat forbids shows as no answer.",
    guidelines: [
      "Call look first to find the vehicle, then board it by name or ref. After no answer, look again before you retry.",
    ],
    label: "Vehicle",
  },
};

export const vehicleTool = defineGameTool(vehicleSpec);
