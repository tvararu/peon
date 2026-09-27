import { bearing, distance2d } from "#wow/geometry";
import {
  checkCollision,
  GROUND_ERROR,
  WALKABLE_CLIMB,
} from "#wow/navigation-collision";
import {
  clearAbove,
  columnHeights,
  continuousFloor,
  floorError,
  groundFloors,
  settleStart,
} from "#wow/navigation-column";
import {
  CELL_HEIGHT,
  connectedHeight,
  stepHeight,
  traceHeight,
  uniqueHeight,
} from "#wow/navigation-height";
import { requireNavigationMapName } from "#wow/navigation-maps";
import {
  groundError,
  isGroundError,
  type NativeMap,
  NavigationDataMissing,
  openNativeMap,
  validateNativePoint,
  validateNativeXY,
} from "#wow/navigation-native";

export type NavPoint = { x: number; y: number; z: number };
export type GroundSample = NavPoint & { orientation: number };
export type NavDestination = { x: number; y: number; z?: number };
export type NavigationOptions = { dataPath: string; libraryPath: string };
export type PlanStart = { stale?: boolean };
export type Navigation = {
  plan: (
    mapId: number,
    from: NavPoint,
    to: NavPoint,
    start?: PlanStart,
  ) => GroundRoute;
  planGround: (
    mapId: number,
    from: NavPoint,
    to: { x: number; y: number },
    start?: PlanStart,
  ) => GroundRoute;
  height: (mapId: number, x: number, y: number, from?: NavPoint) => number;
  stepHeight: (mapId: number, x: number, y: number, from: NavPoint) => number;
  clear: (mapId: number, from: NavPoint, to: NavPoint) => boolean;
  close: () => void;
};

const ADT_STEP = 64;
const GROUND_STEP = 0.5;
const CORNER_RISE = WALKABLE_CLIMB + CELL_HEIGHT;
const ROUTE_AMBIGUITY = "ambiguous ground column at route";
const START_EXIT_AMBIGUITY = "ambiguous ground column leaving start";

type GroundWalk = {
  points: NavPoint[];
  leavingStart: boolean;
  rules: RouteRules;
};
type GroundStep = { point: NavPoint; heights: number[] };
export type RouteRules = { climb: number; columnFallback: boolean };
type StepRules = RouteRules & { ambiguity: string; continuity: boolean };
const STRICT: RouteRules = { climb: 0, columnFallback: false };

export type NavigationRefusal =
  | "wait"
  | "pick_destination"
  | "unreachable"
  | "stop";

const UNREACHABLE = [
  "pathfind_find_path failed (UNKNOWN_PATH)",
  "end snapped off the requested ground position",
  "native path omits destination",
];

export function classifyNavigationRefusal(reason: string): NavigationRefusal {
  if (reason.includes("position disagrees with ground height")) return "wait";
  if (
    reason.includes("ambiguous ground column at destination") ||
    reason.includes("destination is not on a ground floor")
  )
    return "pick_destination";
  if (UNREACHABLE.some((cause) => reason.includes(cause))) return "unreachable";
  return "stop";
}

export function refusalFloors(error: unknown): number[] | undefined {
  if (!(error instanceof Error && "floors" in error)) return undefined;
  return Array.isArray(error.floors) ? [...error.floors] : undefined;
}

export class GroundRoute {
  readonly points: readonly NavPoint[];
  readonly length: number;
  private readonly map: NativeMap;
  private readonly rules: RouteRules;
  private readonly distances: number[];

  constructor(points: readonly NavPoint[], map: NativeMap, rules = STRICT) {
    if (points.length === 0) throw new Error("ground route has no points");
    this.map = map;
    this.rules = rules;
    this.points = Object.freeze(
      groundPath(map, points, rules).map((point) => Object.freeze(point)),
    );
    this.distances = [0];
    let length = 0;
    for (let i = 1; i < this.points.length; i++) {
      const previous = this.points[i - 1];
      const current = this.points[i];
      if (previous === undefined || current === undefined)
        throw new Error("ground route point missing");
      length += distance2d(previous, current);
      this.distances.push(length);
    }
    this.length = length;
  }

  sample(distance: number): GroundSample {
    if (!Number.isFinite(distance)) throw new Error("invalid route distance");
    const travel = Math.min(this.length, Math.max(0, distance));
    const index = this.segment(travel);
    const start = this.points[index];
    if (start === undefined) throw new Error("ground route point missing");
    const end = this.points[index + 1] ?? start;
    const span = distance2d(start, end);
    const base = this.distances[index];
    if (base === undefined) throw new Error("ground route distance missing");
    const ratio =
      span === 0 ? 0 : Math.min(1, Math.max(0, (travel - base) / span));
    const at = {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    };
    const { point } = groundPoint(this.map, start, at, {
      ...this.rules,
      ambiguity: ROUTE_AMBIGUITY,
      continuity: true,
    });
    if (travel === 0) Object.assign(point, this.points[0]);
    return {
      ...point,
      orientation: bearing(start, end),
    };
  }

  private segment(distance: number): number {
    let low = 0;
    let high = this.points.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      const mark = this.distances[mid];
      if (mark === undefined) throw new Error("ground route distance missing");
      if (mark < distance) low = mid;
      else high = mid;
    }
    return low;
  }
}

export function createNavigation(
  options: NavigationOptions,
  openMap = openNativeMap,
): Navigation {
  const { dataPath, libraryPath } = options;
  if (dataPath.length === 0) throw new Error("navigation dataPath is required");
  if (libraryPath.length === 0)
    throw new Error("navigation libraryPath is required");
  const opened = new Map<number, NativeMap>();
  let closed = false;
  function open(mapId: number, ...points: NavPoint[]): NativeMap {
    if (closed) throw new Error("navigation is closed");
    const name = requireNavigationMapName(mapId);
    for (const point of points) validateNativePoint(point);
    const map =
      opened.get(mapId) ??
      openAvailable(mapId, name, () => openMap(dataPath, libraryPath, name));
    opened.set(mapId, map);
    return map;
  }
  return {
    plan(mapId, from, to, start) {
      const map = open(mapId, from, to);
      map.loadAdtAt(from.x, from.y);
      return planRoute(map, settleStart(map, from, start?.stale), to);
    },
    planGround(mapId, pose, to, start) {
      validateNativeXY(to.x, to.y);
      const map = open(mapId, pose);
      map.loadAdtAt(pose.x, pose.y);
      const from = settleStart(map, pose, start?.stale);
      checkStart(map, from);
      map.loadAdtAt(to.x, to.y);
      const z = destinationFloor(map, to.x, to.y);
      return planRoute(map, from, { x: to.x, y: to.y, z });
    },
    height(mapId, x, y, from) {
      validateNativeXY(x, y);
      const map = open(mapId, ...(from ? [from] : []));
      if (from) map.loadAdtAt(from.x, from.y);
      map.loadAdtAt(x, y);
      return from ? connectedHeight(map, x, y, from) : uniqueHeight(map, x, y);
    },
    stepHeight(mapId, x, y, from) {
      validateNativeXY(x, y);
      const map = open(mapId, from);
      map.loadAdtAt(from.x, from.y);
      map.loadAdtAt(x, y);
      return stepHeight(map, x, y, from);
    },
    clear(mapId, from, to) {
      const map = open(mapId, from, to);
      map.loadAdtAt(to.x, to.y);
      return map.lineOfSight(from, to);
    },
    close() {
      closed = true;
      for (const map of opened.values()) map.close();
      opened.clear();
    },
  };
}

function openAvailable(
  mapId: number,
  name: string,
  openMap: () => NativeMap,
): NativeMap {
  try {
    return openMap();
  } catch (error) {
    if (error instanceof NavigationDataMissing)
      throw new Error(`unsupported map ${mapId} (no ${name} navigation data)`, {
        cause: error,
      });
    throw error;
  }
}

function planRoute(map: NativeMap, from: NavPoint, to: NavPoint): GroundRoute {
  loadCorridor(map, from, to);
  checkStart(map, from);
  checkDestination(map, to);
  const points = map.findPath(from, to);
  if (points.length === 0) throw new Error("native path is empty");
  for (const point of points) validateNativePoint(point);
  const firstNative = points[0];
  const lastNative = points.at(-1);
  if (firstNative === undefined || lastNative === undefined)
    throw new Error("native path is empty");
  rejectSnap("start", from, firstNative);
  rejectSnap("end", to, lastNative);
  if (points.length === 1 && distance2d(from, to) > 0)
    throw new Error("native path omits destination");
  try {
    return new GroundRoute([from, to], map);
  } catch (error) {
    if (!isGroundError(error)) throw error;
  }
  const corridor = points.map((point) => ({ ...point }));
  corridor[0] = { ...from };
  if (corridor.length > 1) corridor[corridor.length - 1] = { ...to };
  const rules = { climb: WALKABLE_CLIMB, columnFallback: false };
  try {
    return new GroundRoute(corridor, map, rules);
  } catch (error) {
    if (!(isGroundError(error) && lostHeight(error))) throw error;
    return columnRoute(map, [corridor, [from, to]], error);
  }
}

function columnRoute(
  map: NativeMap,
  candidates: readonly (readonly NavPoint[])[],
  refusal: Error,
): GroundRoute {
  for (const [index, points] of candidates.entries()) {
    const climb = index === 0 ? WALKABLE_CLIMB : 0;
    try {
      return new GroundRoute(points, map, { climb, columnFallback: true });
    } catch (error) {
      if (!isGroundError(error)) throw error;
    }
  }
  throw refusal;
}

function lostHeight(error: Error): boolean {
  return error.message.includes("UNKNOWN_HEIGHT");
}

function groundPath(
  map: NativeMap,
  corners: readonly NavPoint[],
  rules: RouteRules,
): NavPoint[] {
  const first = corners[0];
  if (first === undefined) throw new Error("ground route has no points");
  validateNativePoint(first);
  map.loadAdtAt(first.x, first.y);
  const leavingStart = groundFloors(checkStart(map, first)).length > 1;
  const ambiguity = leavingStart ? START_EXIT_AMBIGUITY : ROUTE_AMBIGUITY;
  const initial = groundPoint(map, first, first, {
    ...rules,
    ambiguity,
    continuity: !leavingStart,
  }).point;
  if (Math.abs(initial.z - first.z) > GROUND_ERROR)
    throw groundError("start is not on connected ground");
  const walk: GroundWalk = { points: [{ ...first }], leavingStart, rules };
  for (let i = 1; i < corners.length; i++) {
    const from = corners[i - 1];
    const to = corners[i];
    if (from === undefined || to === undefined)
      throw new Error("ground route corner missing");
    const corner = stepCorner(map, walk, from, to);
    const agrees =
      i < corners.length - 1
        ? meshCornerOnGround(map, corner, to.z)
        : Math.abs(corner.z - to.z) <= GROUND_ERROR;
    if (!agrees)
      throw groundError("path corner disagrees with connected ground");
  }
  return walk.points;
}

function stepCorner(
  map: NativeMap,
  walk: GroundWalk,
  from: NavPoint,
  to: NavPoint,
): NavPoint {
  validateNativePoint(to);
  const span = distance2d(from, to);
  if (span === 0 && Math.abs(to.z - from.z) > GROUND_ERROR)
    throw groundError("unsupported vertical ground route");
  const count = Math.ceil(span / GROUND_STEP);
  for (let step = 1; step <= count; step++) {
    const ratio = step / count;
    const tail = walk.points.at(-1);
    if (tail === undefined) throw new Error("ground route point missing");
    const at = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };
    const { point, heights } = groundPoint(map, tail, at, {
      ...walk.rules,
      ambiguity: walk.leavingStart ? START_EXIT_AMBIGUITY : ROUTE_AMBIGUITY,
      continuity: !walk.leavingStart,
    });
    walk.points.push(point);
    walk.leavingStart &&= groundFloors(heights).length > 1;
  }
  const corner = walk.points.at(-1);
  if (corner === undefined) throw new Error("ground route point missing");
  return corner;
}

function meshCornerOnGround(
  map: NativeMap,
  ground: NavPoint,
  meshZ: number,
): boolean {
  const rise = meshZ - ground.z;
  if (rise < -GROUND_ERROR || rise > CORNER_RISE) return false;
  return map
    .findHeights(ground.x, ground.y)
    .every(
      (height) =>
        Math.abs(height - ground.z) <= GROUND_ERROR ||
        Math.abs(height - meshZ) > Math.abs(rise),
    );
}

function groundPoint(
  map: NativeMap,
  from: NavPoint,
  { x, y }: { x: number; y: number },
  { climb, ambiguity, columnFallback, continuity }: StepRules,
): GroundStep {
  map.loadAdtAt(x, y);
  const traced = traceHeight(map, from, { x, y }, columnFallback);
  const z = continuity
    ? continuousFloor(columnHeights(map, x, y), traced, from.z)
    : traced;
  const point = { x, y, z };
  const heights = checkRouteGround(map, point, from, ambiguity);
  const back = returnHeight(map, point, from, { columnFallback, continuity });
  if (!Number.isFinite(back) || Math.abs(back - from.z) > GROUND_ERROR)
    throw groundError("ground corridor changes surface");
  checkCollision(map, from, point, climb);
  return { point, heights };
}

function returnHeight(
  map: NativeMap,
  point: NavPoint,
  from: NavPoint,
  rules: Pick<StepRules, "columnFallback" | "continuity">,
): number {
  const back = traceHeight(map, point, from, rules.columnFallback);
  if (!rules.continuity || Math.abs(back - from.z) <= GROUND_ERROR) return back;
  return continuousFloor(columnHeights(map, from.x, from.y), back, point.z);
}

function checkRouteGround(
  map: NativeMap,
  point: NavPoint,
  from: NavPoint,
  ambiguity: string,
): number[] {
  validateNativePoint(point);
  const heights = columnHeights(map, point.x, point.y);
  const others = heights.filter(
    (height) => Math.abs(height - point.z) > GROUND_ERROR,
  );
  if (others.length === heights.length)
    throw groundError("position disagrees with ground height");
  if (others.length === 0) return heights;
  if (
    !clearAbove(heights, point.z) ||
    Math.abs(point.z - from.z) > WALKABLE_CLIMB
  )
    throw groundError(ambiguity);
  return heights;
}

function checkStart(map: NativeMap, point: NavPoint): number[] {
  validateNativePoint(point);
  const heights = columnHeights(map, point.x, point.y);
  if (heights.every((height) => Math.abs(height - point.z) > GROUND_ERROR))
    throw groundError("position disagrees with ground height");
  if (!clearAbove(heights, point.z))
    throw groundError("ambiguous ground column at start");
  return heights;
}

function checkDestination(map: NativeMap, point: NavPoint): void {
  validateNativePoint(point);
  const heights = columnHeights(map, point.x, point.y);
  const onSurface = heights.some(
    (height) => Math.abs(height - point.z) <= GROUND_ERROR,
  );
  if (onSurface && clearAbove(heights, point.z)) return;
  throw floorError("destination is not on a ground floor", heights);
}

function destinationFloor(map: NativeMap, x: number, y: number): number {
  const heights = columnHeights(map, x, y);
  const floors = groundFloors(heights);
  const floor = floors[0];
  if (floor === undefined) throw groundError("ground height unavailable");
  if (floors.length > 1)
    throw floorError("ambiguous ground column at destination", heights);
  return floor;
}

function loadCorridor(map: NativeMap, from: NavPoint, to: NavPoint): void {
  const steps = Math.max(1, Math.ceil(distance2d(from, to) / ADT_STEP));
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    map.loadAdtAt(
      from.x + (to.x - from.x) * ratio,
      from.y + (to.y - from.y) * ratio,
    );
  }
}

function rejectSnap(
  label: string,
  requested: NavPoint,
  actual: NavPoint,
): void {
  validateNativePoint(actual);
  const dx = Math.abs(actual.x - requested.x);
  const dy = Math.abs(actual.y - requested.y);
  const roundX = Math.abs(Math.fround(requested.x) - requested.x) + 1e-6;
  const roundY = Math.abs(Math.fround(requested.y) - requested.y) + 1e-6;
  if (
    dx > roundX ||
    dy > roundY ||
    Math.abs(actual.z - requested.z) > GROUND_ERROR
  ) {
    throw new Error(`${label} snapped off the requested ground position`);
  }
}
