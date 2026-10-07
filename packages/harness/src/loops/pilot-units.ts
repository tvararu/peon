import {
  distance2d,
  isUnit,
  type NearbyRow,
  ObjectType,
  UnitFlag,
} from "@peon/core";
import { grayLevel } from "#harness/loops/combat-actions-credit";
import {
  goalBearingText,
  type PilotPose,
  relativeDeg,
} from "#harness/loops/pilot-geometry";

export const PILOT_UNIT_VIEW_YD = 60;
export const PILOT_UNIT_LIMIT = 5;
export const AGGRO_BUFFER_YD = 1;
export const AGGRO_LEVEL_FLOOR = -25;
export const AGGRO_BASE_YD = 20;
export const AGGRO_MIN_YD = 5;
export const AGGRO_MAX_YD = 45;

export type UnitState =
  | "attacking you"
  | "in combat"
  | "moving"
  | "standing still";

export type PilotUnit = {
  attacksFirst: boolean;
  bearing: number;
  distanceYd: number;
  dz: number;
  gray: boolean;
  guid: bigint;
  level: number | undefined;
  marginYd: number;
  name: string;
  radiusYd: number | undefined;
  state: UnitState | undefined;
  x: number;
  y: number;
};

export type AggroCircle = {
  name: string;
  x: number;
  y: number;
  radiusYd: number;
};

export type DangerHit = { name: string; yd: number };

export function aggroRadiusYd(selfLevel: number, mobLevel: number): number {
  const diff = Math.max(selfLevel - mobLevel, AGGRO_LEVEL_FLOOR);
  return Math.min(AGGRO_MAX_YD, Math.max(AGGRO_MIN_YD, AGGRO_BASE_YD - diff));
}

function livingLevel(
  entity: NearbyRow["entity"] | undefined,
): number | undefined {
  if (!isUnit(entity) || entity.level <= 0) return undefined;
  return entity.level;
}

function stateOf(row: NearbyRow): UnitState | undefined {
  if (row.attackingMe) return "attacking you";
  if (isUnit(row.entity) && (row.entity.unitFlags & UnitFlag.IN_COMBAT) !== 0)
    return "in combat";
  const motion = row.remotePose?.motion;
  if (motion === "moving") return "moving";
  if (motion === "stationary") return "standing still";
  return undefined;
}

function unitOf(
  row: NearbyRow,
  pose: PilotPose,
  selfLevel: number | undefined,
  aggro: (guid: bigint) => boolean,
): PilotUnit | undefined {
  const { entity, position } = row;
  if (row.self || !isUnit(entity) || entity.objectType !== ObjectType.UNIT)
    return undefined;
  if (row.relation !== "hostile" || entity.health <= 0) return undefined;
  if (!position || position.mapId !== pose.mapId) return undefined;
  const distanceYd = distance2d(position, pose);
  if (distanceYd > PILOT_UNIT_VIEW_YD) return undefined;
  const level = livingLevel(entity);
  const gray =
    level !== undefined &&
    selfLevel !== undefined &&
    level <= grayLevel(selfLevel);
  const attacksFirst = aggro(entity.guid);
  const radiusYd =
    !attacksFirst || gray || level === undefined || selfLevel === undefined
      ? undefined
      : aggroRadiusYd(selfLevel, level);
  return {
    attacksFirst,
    bearing: Math.atan2(position.y - pose.y, position.x - pose.x),
    distanceYd,
    dz: position.z - pose.z,
    gray,
    guid: entity.guid,
    level,
    marginYd: distanceYd - (radiusYd ?? 0),
    name: entity.name ?? "an unknown unit",
    radiusYd,
    state: stateOf(row),
    x: position.x,
    y: position.y,
  };
}

export function buildPilotUnits(
  rows: readonly NearbyRow[],
  pose: PilotPose,
  aggro: (guid: bigint) => boolean = () => true,
): PilotUnit[] {
  const selfLevel = livingLevel(rows.find((row) => row.self)?.entity);
  return rows
    .flatMap((row) => {
      const unit = unitOf(row, pose, selfLevel, aggro);
      return unit ? [unit] : [];
    })
    .sort((a, b) => a.marginYd - b.marginYd)
    .slice(0, PILOT_UNIT_LIMIT);
}

export function dangerUnits(
  rows: readonly NearbyRow[],
  pose: PilotPose,
  aggro: (guid: bigint) => boolean = () => true,
  skip?: (unit: PilotUnit) => boolean,
): PilotUnit[] {
  const selfLevel = livingLevel(rows.find((row) => row.self)?.entity);
  return rows.flatMap((row) => {
    const unit = unitOf(row, pose, selfLevel, aggro);
    if (!unit || unit.radiusYd === undefined) return [];
    return skip?.(unit) ? [] : [unit];
  });
}

export function aggroCircles(units: readonly PilotUnit[]): AggroCircle[] {
  return units.flatMap((unit) =>
    unit.radiusYd === undefined
      ? []
      : [
          {
            name: unit.name,
            radiusYd: unit.radiusYd + AGGRO_BUFFER_YD,
            x: unit.x,
            y: unit.y,
          },
        ],
  );
}

export function rayEntryYd(
  origin: { x: number; y: number },
  heading: number,
  circle: AggroCircle,
): number | undefined {
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  const px = origin.x - circle.x;
  const py = origin.y - circle.y;
  const along = px * dx + py * dy;
  const outside = px * px + py * py - circle.radiusYd * circle.radiusYd;
  if (outside < 0) return along > 1e-9 ? undefined : 0;
  const reach = along * along - outside;
  if (reach < 0) return undefined;
  const entry = -along - Math.sqrt(reach);
  return entry >= 0 ? entry : undefined;
}

export function dangerAlong(
  origin: { x: number; y: number },
  heading: number,
  circles: readonly AggroCircle[],
  limitYd: number,
): DangerHit | undefined {
  let nearest: DangerHit | undefined;
  for (const circle of circles) {
    const yd = rayEntryYd(origin, heading, circle);
    if (yd === undefined || yd > limitYd) continue;
    if (nearest === undefined || yd < nearest.yd)
      nearest = { name: circle.name, yd };
  }
  return nearest;
}

export function unitLine(unit: PilotUnit, pose: PilotPose): string {
  const level =
    unit.level === undefined ? "level unknown" : `level ${unit.level}`;
  const bearing = goalBearingText(relativeDeg(unit.bearing, pose.orientation));
  const state = unit.state === undefined ? "" : `; ${unit.state} (observed)`;
  const height =
    Math.abs(unit.dz) < 3
      ? ""
      : `; ${Math.round(Math.abs(unit.dz))} yd ${unit.dz > 0 ? "above" : "below"} you`;
  return `${unit.name}, ${level}: ${Math.round(unit.distanceYd)} yd ${bearing}${state}${height}. ${rangeText(unit)}`;
}

function rangeText(unit: PilotUnit): string {
  if (!unit.attacksFirst) return "does not attack first (game data).";
  if (unit.gray)
    return "Gray to you (game rules): harmless, so not counted as danger.";
  if (unit.radiusYd === undefined)
    return "Aggro range not inferred: level unknown.";
  return `Inferred aggro range ${unit.radiusYd} yd: you are ${rangeOffset(unit)}.`;
}

function rangeOffset(unit: PilotUnit): string {
  const margin = Math.round(Math.abs(unit.marginYd));
  if (margin === 0) return "at the edge of it";
  return `${margin} yd ${unit.marginYd > 0 ? "outside" : "inside"} it`;
}

export function unitLines(
  units: readonly PilotUnit[],
  pose: PilotPose,
): string[] | string {
  if (units.length === 0) return "none in view";
  return units.map((unit) => unitLine(unit, pose));
}

export function hazardText(hit: DangerHit | undefined): string {
  if (hit === undefined) return "";
  return `; enters ${hit.name}'s inferred aggro range after ${Math.round(hit.yd)} yd`;
}

export function lineHazardText(hit: DangerHit | undefined): string {
  if (hit === undefined) return "";
  return `; the straight line passes through ${hit.name}'s inferred aggro range`;
}
