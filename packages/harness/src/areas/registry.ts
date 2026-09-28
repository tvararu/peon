import type { AreaName } from "@peon/core";

export const HARNESS_AREAS = {};
export const HARNESS_AREAS_TOTAL: [
  Exclude<AreaName, keyof typeof HARNESS_AREAS>,
] extends [never]
  ? true
  : never = true;
