import type { WorldHandle } from "#wow/client";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

export type PlaceState = {
  mapId: number | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  zone: string | undefined;
  area: string | undefined;
  at: number | undefined;
};

type Place = Pick<WorldHandle, "getPlaceState">;

export function placeMethods(_conn: WorldConn, _rt: Runtimes): Place {
  return {
    getPlaceState() {
      throw new Error("not_implemented");
    },
  };
}
