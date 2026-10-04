import {
  bearing,
  distance2d,
  GROUND_ERROR,
  type NavPoint,
  WALKABLE_CLIMB,
} from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import {
  clearAbove,
  columnHeights,
  continuousFloor,
  groundFloors,
  settleStart,
} from "#harness/navigation/column";
import {
  checkDestination,
  destinationFloor,
  routableFloor,
} from "#harness/navigation/destination";
import {
  connectedHeight,
  stepHeight,
  traceHeight,
  uniqueHeight,
} from "#harness/navigation/height";
import {
  groundError,
  isGroundError,
  type NativeMap,
  validateNativePoint,
  validateNativeXY,
} from "#harness/navigation/native";
import {
  rejectSnap,
  sampleLead,
  startStep,
} from "#harness/navigation/start-snap";
import {
  CORNER_RISE,
  type CornerWalk,
  cornerMatches,
  ROUTE_AMBIGUITY,
  routeStep,
  START_EXIT_AMBIGUITY,
  type StepRules,
  stepCorner,
  surfaceAt,
  waterStart,
} from "#harness/navigation/swim";

export type GroundSample = NavPoint & {
  orientation: number;
  swimming: boolean;
};
export type NavDestination = { x: number; y: number; z?: number };
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
  floorsAt: (mapId: number, x: number, y: number) => number[];
  height: (mapId: number, x: number, y: number, from?: NavPoint) => number;
  stepHeight: (mapId: number, x: number, y: number, from: NavPoint) => number;
  clear: (mapId: number, from: NavPoint, to: NavPoint) => boolean;
  close: () => void;
};

const ADT_STEP = 64;

export type GroundWalk = CornerWalk;
export type GroundStep = {
  point: NavPoint;
  heights: number[];
  swimming: boolean;
};
export type RouteRules = { climb: number; columnFallback: boolean };

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
  private readonly swims: readonly boolean[];
  private readonly lead: boolean;
  private readonly distances: number[];

  constructor(
    points: readonly NavPoint[],
    map: NativeMap,
    rules = STRICT,
    lead?: NavPoint,
  ) {
    if (points.length === 0) throw new Error("ground route has no points");
    this.map = map;
    this.rules = rules;
    this.lead = lead !== undefined;
    const built = groundPath(map, points, rules);
    const walked = lead === undefined ? built.points : [lead, ...built.points];
    this.points = Object.freeze(walked.map((point) => Object.freeze(point)));
    this.swims = Object.freeze(
      lead === undefined ? [...built.swims] : [false, ...built.swims],
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

  sample(distance: number, previous?: NavPoint): GroundSample {
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
    if (this.lead && index === 0)
      return sampleLead(this.map, { end, ratio, start }, at, previous);
    const stepped = groundStep({
      at,
      from: start,
      fromSwimming: this.swims[index] ?? false,
      map: this.map,
      rules: { ...this.rules, ambiguity: ROUTE_AMBIGUITY, continuity: true },
    });
    const first = this.points[0];
    if (travel === 0 && first !== undefined)
      Object.assign(stepped.point, first);
    return {
      ...stepped.point,
      orientation: bearing(start, end),
      swimming: travel === 0 ? (this.swims[0] ?? false) : stepped.swimming,
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
  openMap: (mapId: number) => NativeMap,
): Navigation {
  const opened = new Map<number, NativeMap>();
  let closed = false;
  function open(mapId: number, ...points: NavPoint[]): NativeMap {
    if (closed) throw new Error("navigation is closed");
    for (const point of points) validateNativePoint(point);
    const map = opened.get(mapId) ?? openMap(mapId);
    opened.set(mapId, map);
    return map;
  }
  return {
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
    floorsAt(mapId, x, y) {
      validateNativeXY(x, y);
      const map = open(mapId);
      map.loadAdtAt(x, y);
      return groundFloors(columnHeights(map, x, y));
    },
    height(mapId, x, y, from) {
      validateNativeXY(x, y);
      const map = open(mapId, ...(from ? [from] : []));
      if (from) map.loadAdtAt(from.x, from.y);
      map.loadAdtAt(x, y);
      return from ? connectedHeight(map, x, y, from) : uniqueHeight(map, x, y);
    },
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
      return planDestination(map, from, to);
    },
    stepHeight(mapId, x, y, from) {
      validateNativeXY(x, y);
      const map = open(mapId, from);
      map.loadAdtAt(from.x, from.y);
      map.loadAdtAt(x, y);
      return stepHeight(map, x, y, from);
    },
  };
}

function planDestination(
  map: NativeMap,
  from: NavPoint,
  to: { x: number; y: number },
): GroundRoute {
  try {
    const z = destinationFloor(map, to.x, to.y);
    return planRoute(map, from, { x: to.x, y: to.y, z });
  } catch (error) {
    const floors = refusalFloors(error);
    if (floors === undefined || floors.length < 2) throw error;
    return routableFloor(floors, (z) =>
      planRoute(map, from, { x: to.x, y: to.y, z }),
    );
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
  const stepOnto = startStep(map, from, firstNative);
  rejectSnap("end", to, lastNative);
  if (points.length === 1 && distance2d(from, to) > 0)
    throw new Error("native path omits destination");
  if (stepOnto !== undefined) return leadRoute(map, from, points, to);
  try {
    return new GroundRoute([from, to], map);
  } catch (error) {
    if (!isGroundError(error)) throw error;
  }
  const corridor = points.map((point) => ({ ...point }));
  corridor[0] = { ...from };
  if (corridor.length > 1) corridor[corridor.length - 1] = { ...to };
  const rules = { climb: CORNER_RISE, columnFallback: false };
  try {
    return new GroundRoute(corridor, map, rules);
  } catch (error) {
    if (!(isGroundError(error) && lostHeight(error))) throw error;
    return columnRoute(map, [corridor, [from, to]], error);
  }
}

function leadRoute(
  map: NativeMap,
  from: NavPoint,
  points: readonly NavPoint[],
  to: NavPoint,
): GroundRoute {
  const [onto] = points;
  if (onto === undefined) throw new Error("native path is empty");
  const corridor = points.map((point) => ({ ...point }));
  if (corridor.length > 1) corridor[corridor.length - 1] = { ...to };
  const rules = { climb: CORNER_RISE, columnFallback: false };
  try {
    return new GroundRoute(corridor, map, rules, from);
  } catch (error) {
    if (!(isGroundError(error) && lostHeight(error))) throw error;
    return new GroundRoute(
      corridor,
      map,
      { climb: CORNER_RISE, columnFallback: true },
      from,
    );
  }
}

function columnRoute(
  map: NativeMap,
  candidates: readonly (readonly NavPoint[])[],
  refusal: Error,
): GroundRoute {
  for (const [index, points] of candidates.entries()) {
    const climb = index === 0 ? CORNER_RISE : 0;
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
): { points: NavPoint[]; swims: boolean[] } {
  const first = corners[0];
  if (first === undefined) throw new Error("ground route has no points");
  validateNativePoint(first);
  const start = waterStart(map, first);
  const leavingStart = groundFloors(checkStart(map, start)).length > 1;
  const ambiguity = leavingStart ? START_EXIT_AMBIGUITY : ROUTE_AMBIGUITY;
  const initial = groundStep({
    at: start,
    from: start,
    fromSwimming: surfaceAt(map, start, start.z) !== undefined,
    map,
    rules: { ...rules, ambiguity, continuity: !leavingStart },
  });
  const wetStart = surfaceAt(map, start, start.z) !== undefined;
  if (
    Math.abs(initial.point.z - start.z) > GROUND_ERROR &&
    !(wetStart && initial.swimming)
  )
    throw groundError("start is not on connected ground");
  const walk: GroundWalk = {
    leavingStart,
    points: [{ ...start }],
    rules,
    swims: [initial.swimming],
  };
  for (let i = 1; i < corners.length; i++) {
    const from = corners[i - 1];
    const to = corners[i];
    if (from === undefined || to === undefined)
      throw new Error("ground route corner missing");
    const corner = stepCorner(walk, from, to, (tail, at, step) =>
      groundStep({
        at,
        from: tail,
        fromSwimming: tailSwimming(walk, tail),
        map,
        rules: step,
      }),
    );
    const swimTo = surfaceAt(map, to, corner.z);
    if (
      cornerMatches(map, {
        corner,
        interior: i < corners.length - 1,
        swimTo,
        to,
      })
    )
      continue;
    throw groundError("path corner disagrees with connected ground");
  }
  return { points: walk.points, swims: walk.swims };
}

export function tailSwimming(walk: GroundWalk, tail: NavPoint): boolean {
  const index = walk.points.lastIndexOf(tail);
  return walk.swims[index] ?? false;
}

type Attempt = {
  map: NativeMap;
  from: NavPoint;
  fromSwimming: boolean;
  at: { x: number; y: number };
  rules: StepRules;
};

function groundStep({
  map,
  from,
  fromSwimming,
  at,
  rules,
}: Attempt): GroundStep {
  const ground = (fresh: NavPoint, probe: { x: number; y: number }) =>
    groundPoint(map, fresh, probe, rules);
  return routeStep({ at, from, fromSwimming, ground, map, rules });
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
  return { heights, point, swimming: false };
}

function returnHeight(
  map: NativeMap,
  point: NavPoint,
  from: NavPoint,
  rules: Pick<StepRules, "columnFallback" | "continuity">,
): number {
  const back = traceHeight(map, point, from, rules.columnFallback);
  const settled = !(rules.continuity && Number.isFinite(back));
  if (settled || Math.abs(back - from.z) <= GROUND_ERROR) return back;
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
  const climb =
    groundFloors(heights).length === 1 ? CORNER_RISE : WALKABLE_CLIMB;
  if (!clearAbove(heights, point.z) || Math.abs(point.z - from.z) > climb)
    throw groundError(ambiguity);
  return heights;
}

function checkStart(map: NativeMap, point: NavPoint): number[] {
  validateNativePoint(point);
  const surface = surfaceAt(map, point, point.z);
  if (surface !== undefined && Math.abs(surface - point.z) <= GROUND_ERROR)
    return [surface];
  const heights = columnHeights(map, point.x, point.y);
  if (heights.every((height) => Math.abs(height - point.z) > GROUND_ERROR))
    throw groundError("position disagrees with ground height");
  if (!clearAbove(heights, point.z))
    throw groundError("ambiguous ground column at start");
  return heights;
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
