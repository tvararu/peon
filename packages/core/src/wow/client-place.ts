import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { WorldHandle } from "#wow/client";
import type { AreaExplored } from "#wow/control";
import type { PacketReader } from "#wow/protocol/packet";
import {
  type InitWorldStates,
  parseInitWorldStates,
} from "#wow/protocol/world-states";
import type { SessionStores } from "#wow/session-stores";
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

export type PlaceEvent =
  | { type: "place_changed" }
  | { type: "area_explored"; explored: AreaExplored };

export class PlaceStore {
  private readonly events = new Emitter<[PlaceEvent]>();
  private place: PlaceState | undefined;

  onEvent(listener: (event: PlaceEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  snapshot(): PlaceState {
    return { ...(this.place ?? EMPTY) };
  }

  receiveWorldStates(parsed: InitWorldStates, at: number): void {
    const place = placeOf(parsed, at);
    const changed = !samePlace(this.place, place);
    this.place = place;
    if (changed) this.events.emit({ type: "place_changed" });
  }

  receiveExploration(areaId: number, xp: number): void {
    this.events.emit({
      type: "area_explored",
      explored: { areaId, area: areaName(areaId), xp },
    });
  }

  dispose(): void {
    this.events.clear();
    this.place = undefined;
  }
}

export function handleInitWorldStates(
  { place }: Pick<SessionStores, "place">,
  r: PacketReader,
): void {
  place.receiveWorldStates(parseInitWorldStates(r), Date.now());
}

export function handleExplorationExperience(
  { place }: Pick<SessionStores, "place">,
  r: PacketReader,
): void {
  const areaId = r.uint32LE();
  place.receiveExploration(areaId, r.uint32LE());
}

export function placeMethods(
  stores: Pick<SessionStores, "place">,
): PlaceMethods {
  return {
    getPlaceState() {
      return stores.place.snapshot();
    },
  };
}
