import type { AreaActsOf } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export type VehicleDo = "board" | "leave" | "seat" | "ride_with" | "eject";

export type VehicleArgs = {
  do: VehicleDo;
  unit?: string;
  player?: string;
  seat?: "next" | "prev" | number;
};

export type VehicleAfter = {
  do: VehicleDo;
  target: string | undefined;
};

export type VehicleCtx = ToolCtx<VehicleAfter>;

export type VehicleOutcome = AreaActsOf<"vehicles">["spellClick"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;
