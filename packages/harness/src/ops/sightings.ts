import {
  type Entity,
  type NearbyRow,
  ObjectType,
  type Position,
  type UnitEntity,
} from "@tuicraft/core";
import type { Clock, Sighting, Sightings } from "#harness/contract/services";
import { isUnitEntity } from "#harness/ops/refs";

export const SIGHTING_TTL_MS = 1_800_000;

type Known = Pick<Sighting, "lootable" | "name" | "relation" | "roles">;
type Located = { entity: UnitEntity; position: Position; seenAt: number };

function sightingOf(
  { entity, position, seenAt }: Located,
  known: Known,
): Sighting {
  return {
    ...known,
    alive: entity.health > 0,
    entry: entity.entry,
    guid: entity.guid,
    kind: entity.objectType === ObjectType.PLAYER ? "player" : "creature",
    level: entity.level,
    mapId: position.mapId,
    seenAt,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function fromRow(
  row: NearbyRow,
  previous: Sighting | undefined,
  seenAt: number,
): Sighting | undefined {
  const { entity, position } = row;
  if (row.self || !isUnitEntity(entity) || !position) return;
  const relation =
    row.relation === "unknown"
      ? (previous?.relation ?? "unknown")
      : row.relation;
  const name = entity.name ?? previous?.name ?? "unknown";
  return sightingOf(
    { entity, position, seenAt },
    { lootable: row.lootable, name, relation, roles: row.roles },
  );
}

function fromEntity(
  entity: Entity,
  previous: Sighting | undefined,
  seenAt: number,
): Sighting | undefined {
  const name = entity.name ?? previous?.name;
  const { position } = entity;
  if (!(isUnitEntity(entity) && position && name)) return;
  const known = {
    lootable: previous?.lootable ?? false,
    name,
    relation: previous?.relation ?? "unknown",
    roles: previous?.roles ?? [],
  };
  return sightingOf({ entity, position, seenAt }, known);
}

export function createSightings(clock: Clock): Sightings {
  const seen = new Map<bigint, Sighting>();
  const fresh = (sighting: Sighting) =>
    clock.now() - sighting.seenAt <= SIGHTING_TTL_MS;
  const keep = (sighting: Sighting | undefined) => {
    if (sighting) seen.set(sighting.guid, sighting);
  };
  return {
    all: () => [...seen.values()].filter(fresh),
    attach: (handle) =>
      handle.onEntityEvent((event) => {
        if (
          event.type === "disappear" ||
          event.entity.guid === handle.getControlState().selfGuid
        )
          return;
        keep(
          fromEntity(event.entity, seen.get(event.entity.guid), clock.now()),
        );
      }),
    get(guid) {
      const sighting = seen.get(guid);
      return sighting && fresh(sighting) ? sighting : undefined;
    },
    note: (row) => keep(fromRow(row, seen.get(row.entity.guid), clock.now())),
    prune(now) {
      for (const [guid, sighting] of seen)
        if (now - sighting.seenAt > SIGHTING_TTL_MS) seen.delete(guid);
    },
  };
}
