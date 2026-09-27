import type { WorldHandle } from "#wow/client";
import type { PacketReader } from "#wow/protocol/packet";
import {
  type InitWorldStates,
  parseInitWorldStates,
} from "#wow/protocol/world-states";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import areaNames from "./data/area-names.json" with { type: "json" };

export type PlaceState = {
  mapId: number | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  zone: string | undefined;
  area: string | undefined;
  at: number | undefined;
};

type PlaceMethods = Pick<WorldHandle, "getPlaceState">;

const names: Readonly<Record<string, string>> = areaNames;

const EMPTY: PlaceState = {
  mapId: undefined,
  zoneId: undefined,
  areaId: undefined,
  zone: undefined,
  area: undefined,
  at: undefined,
};

export function areaName(id: number): string | undefined {
  return names[String(id)];
}

function placeOf(parsed: InitWorldStates, at: number): PlaceState {
  const { mapId, zoneId, areaId } = parsed;
  const zone = areaName(zoneId);
  const area = areaName(areaId);
  return { mapId, zoneId, areaId, zone, area, at };
}

function samePlace(last: PlaceState | undefined, next: PlaceState): boolean {
  if (!last) return false;
  const sameMap = last.mapId === next.mapId;
  return sameMap && last.zoneId === next.zoneId && last.areaId === next.areaId;
}

export function handleInitWorldStates(conn: WorldConn, r: PacketReader): void {
  const place = placeOf(parseInitWorldStates(r), Date.now());
  const changed = !samePlace(conn.place, place);
  conn.place = place;
  const { control } = conn;
  if (!(changed && control)) return;
  conn.events.control.emit({
    type: "place_changed",
    state: control.snapshot(),
  });
}

export function handleExplorationExperience(
  conn: WorldConn,
  r: PacketReader,
): void {
  const areaId = r.uint32LE();
  const xp = r.uint32LE();
  const { control } = conn;
  if (!control) return;
  conn.events.control.emit({
    type: "area_explored",
    state: control.snapshot(),
    explored: { areaId, area: areaName(areaId), xp },
  });
}

export function placeMethods(conn: WorldConn, _rt: Runtimes): PlaceMethods {
  return {
    getPlaceState() {
      return { ...(conn.place ?? EMPTY) };
    },
  };
}
