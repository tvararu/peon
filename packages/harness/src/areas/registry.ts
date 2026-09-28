import type { AreaName } from "@peon/core";
import { timeHarness } from "#harness/areas/time/area";

export const HARNESS_AREAS = {
  time: timeHarness,
};
export const HARNESS_AREAS_TOTAL: [
  Exclude<AreaName, keyof typeof HARNESS_AREAS>,
] extends [never]
  ? true
  : never = true;
