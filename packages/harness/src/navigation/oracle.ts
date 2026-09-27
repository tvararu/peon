import type { GroundOracle } from "@peon/core";
import type { Navigation } from "#harness/navigation/planner";

export function groundOracle(navigation: Navigation): GroundOracle {
  return {
    height(mapId, x, y, from) {
      try {
        return from
          ? navigation.stepHeight(mapId, x, y, from)
          : navigation.height(mapId, x, y);
      } catch {
        return Number.NaN;
      }
    },
    pathClear(mapId, from, to) {
      try {
        return navigation.clear(mapId, from, to);
      } catch {
        return false;
      }
    },
  };
}
