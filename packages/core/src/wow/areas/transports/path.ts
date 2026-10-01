import { type DbcFile, type DbcSpec, f32, u32 } from "#wow/dbc";

export const TAXI_PATH_NODE_LAYOUT = {
  file: "TaxiPathNode.dbc",
  fields: 11,
  recordSize: 44,
} as const satisfies DbcSpec;

export type TaxiNode = {
  index: number;
  mapId: number;
  x: number;
  y: number;
  z: number;
  actionFlag: number;
  delay: number;
};

export type TransportPose = {
  mapId: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
  moving: boolean;
};

type Vec = readonly [number, number, number];

const STEPS_PER_SEGMENT = 3;
const TWO_PI = 2 * Math.PI;
const COEFFS = [
  [-0.5, 1.5, -1.5, 0.5],
  [1, -2.5, 2, -0.5],
  [-0.5, 0, 0.5, 0],
  [0, 1, 0, 0],
] as const;

export function readTaxiPaths(file: DbcFile): Map<number, TaxiNode[]> {
  const paths = new Map<number, TaxiNode[]>();
  for (let row = 0; row < file.recordCount; row++) {
    const path = u32(file, row, 1);
    const nodes = paths.get(path) ?? [];
    nodes.push({
      index: u32(file, row, 2),
      mapId: u32(file, row, 3),
      x: f32(file, row, 4),
      y: f32(file, row, 5),
      z: f32(file, row, 6),
      actionFlag: u32(file, row, 7),
      delay: u32(file, row, 8),
    });
    paths.set(path, nodes);
  }
  for (const nodes of paths.values()) nodes.sort((a, b) => a.index - b.index);
  return paths;
}

export function normalizeOrientation(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function weights(row: readonly number[]): number[] {
  return [0, 1, 2, 3].map((k) =>
    row.reduce((sum, t, r) => sum + t * (COEFFS[r]?.[k] ?? 0), 0),
  );
}

function combine(points: readonly Vec[], at: number, w: number[]): Vec {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const p = points[at - 1 + k];
    if (!p) continue;
    for (let axis = 0; axis < 3; axis++)
      out[axis] = (out[axis] ?? 0) + (p[axis] ?? 0) * (w[k] ?? 0);
  }
  return out;
}

class CatmullRom {
  private readonly points: Vec[];
  private readonly lengths: number[];
  readonly hi: number;

  constructor(controls: readonly Vec[]) {
    const count = controls.length;
    const first = controls[0] ?? [0, 0, 0];
    this.points = [
      [first[0] - 1, first[1], first[2]],
      ...controls,
      controls.at(-1) ?? first,
    ];
    this.hi = count;
    this.lengths = new Array<number>(count + 1).fill(0);
    let length = 0;
    for (let i = 1; i < this.hi; i++) {
      length += this.segmentLength(i);
      this.lengths[i + 1] = length;
    }
  }

  private segmentLength(index: number): number {
    let cur = this.points[index] ?? [0, 0, 0];
    let length = 0;
    for (let i = 1; i <= STEPS_PER_SEGMENT; i++) {
      const next = this.evaluate(index, i / STEPS_PER_SEGMENT);
      length += Math.hypot(
        next[0] - cur[0],
        next[1] - cur[1],
        next[2] - cur[2],
      );
      cur = next;
    }
    return length;
  }

  length(first: number, last: number): number {
    return (this.lengths[last] ?? 0) - (this.lengths[first] ?? 0);
  }

  evaluate(index: number, t: number): Vec {
    return combine(this.points, index, weights([t * t * t, t * t, t, 1]));
  }

  derivative(index: number, t: number): Vec {
    return combine(this.points, index, weights([3 * t * t, 2 * t, 1, 0]));
  }
}

type KeyFrame = {
  node: TaxiNode;
  index: number;
  initialOrientation: number;
  distSinceStop: number;
  distUntilStop: number;
  distFromPrev: number;
  timeFrom: number;
  timeTo: number;
  teleport: boolean;
  arriveTime: number;
  departureTime: number;
  spline: CatmullRom | undefined;
  nextDistFromPrev: number;
  nextArriveTime: number;
};

function isStop(frame: KeyFrame): boolean {
  return frame.node.actionFlag === 2;
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function position(node: TaxiNode): Vec {
  return [node.x, node.y, node.z];
}

function headingAt(nodes: readonly TaxiNode[], i: number): number {
  const all: Vec[] = nodes.map(position);
  const first = all[0];
  const second = all[1];
  const last = all.at(-1);
  const beforeLast = all.at(-2);
  if (!(first && second && last && beforeLast)) return 0;
  const head = lerp(first, second, -0.2);
  const tail = lerp(last, beforeLast, -0.2);
  const padded = [head, ...all, tail, lerp(tail, last, -1)];
  const ahead = padded[i + 2];
  const behind = padded[i];
  if (!(ahead && behind)) return 0;
  return normalizeOrientation(
    Math.atan2((ahead[1] - behind[1]) * 0.5, (ahead[0] - behind[0]) * 0.5) +
      Math.PI,
  );
}

function buildFrames(nodes: readonly TaxiNode[]): {
  frames: KeyFrame[];
  splinePath: Vec[];
} {
  const frames: KeyFrame[] = [];
  const splinePath: Vec[] = [];
  let mapChange = false;
  nodes.forEach((node, i) => {
    if (mapChange) {
      mapChange = false;
      return;
    }
    const next = nodes[i + 1];
    if (next && (node.actionFlag & 1 || node.mapId !== next.mapId)) {
      const back = frames.at(-1);
      if (back) back.teleport = true;
      mapChange = true;
      return;
    }
    frames.push({
      node,
      index: 0,
      initialOrientation: headingAt(nodes, i),
      distSinceStop: -1,
      distUntilStop: -1,
      distFromPrev: -1,
      timeFrom: 0,
      timeTo: 0,
      teleport: false,
      arriveTime: 0,
      departureTime: 0,
      spline: undefined,
      nextDistFromPrev: 0,
      nextArriveTime: 0,
    });
    splinePath.push(position(node));
  });
  if (splinePath.length >= 2) {
    splinePath.shift();
    frames.shift();
    splinePath.pop();
    frames.pop();
  }
  return { frames, splinePath };
}

type StopRange = { first: number; last: number };

function stampSpline(
  frames: KeyFrame[],
  spline: CatmullRom,
  start: number,
  end: number,
): void {
  for (let j = start; j < end; j++) {
    const frame = frames[j];
    if (!frame) continue;
    frame.index = j - start + 1;
    frame.distFromPrev = spline.length(j - start, j + 1 - start);
    const before = frames[j - 1];
    if (j > 0 && before) before.nextDistFromPrev = frame.distFromPrev;
    frame.spline = spline;
  }
}

function measureFrame(init: {
  frames: KeyFrame[];
  splinePath: readonly Vec[];
  i: number;
  start: number;
  stops: StopRange;
}): number {
  const { frames, splinePath, i, start, stops } = init;
  const prev = frames[i - 1];
  const cur = frames[i];
  if (!(prev && cur)) return start;
  if (!(prev.teleport || i + 1 === frames.length)) {
    if (isStop(cur)) {
      if (stops.first === -1) stops.first = i;
      stops.last = i;
    }
    return start;
  }
  const extra = prev.teleport ? 0 : 1;
  const spline = new CatmullRom(splinePath.slice(start, i + extra));
  stampSpline(frames, spline, start, i + extra);
  if (prev.teleport) {
    cur.index = i - start + 1;
    cur.distFromPrev = 0;
    prev.nextDistFromPrev = 0;
    cur.spline = spline;
  }
  if (isStop(cur)) {
    if (stops.first === -1) stops.first = i;
    stops.last = i;
  }
  return i;
}

function measureSegments(
  frames: KeyFrame[],
  splinePath: readonly Vec[],
): { firstStop: number; lastStop: number } {
  const first = frames[0];
  if (!first) return { firstStop: 0, lastStop: 0 };
  first.distFromPrev = 0;
  first.index = 1;
  let firstStop = -1;
  let lastStop = -1;
  if (isStop(first)) {
    firstStop = 0;
    lastStop = 0;
  }
  let start = 0;
  const stops = { first: firstStop, last: lastStop };
  for (let i = 1; i < frames.length; i++)
    start = measureFrame({ frames, splinePath, i, start, stops });
  firstStop = stops.first;
  lastStop = stops.last;
  const lastFrame = frames.at(-1);
  if (lastFrame) lastFrame.nextDistFromPrev = first.distFromPrev;
  if (firstStop === -1 || lastStop === -1) return { firstStop: 0, lastStop: 0 };
  return { firstStop, lastStop };
}

function spreadStopDistances(
  frames: KeyFrame[],
  firstStop: number,
  lastStop: number,
): void {
  const n = frames.length;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + lastStop) % n;
    const frame = frames[j];
    if (!frame) continue;
    if (isStop(frame) || j === lastStop) dist = 0;
    else dist += frame.distFromPrev;
    frame.distSinceStop = dist;
  }
  dist = 0;
  for (let i = n - 1; i >= 0; i--) {
    const j = (i + firstStop) % n;
    const frame = frames[j];
    if (!frame) continue;
    dist += frames[(j + 1) % n]?.distFromPrev ?? 0;
    frame.distUntilStop = dist;
    if (isStop(frame) || j === firstStop) dist = 0;
  }
}

function segmentTime(
  frame: KeyFrame,
  speed: number,
  accel: number,
  accelDist: number,
): number {
  const since = frame.distSinceStop;
  const until = frame.distUntilStop;
  if (since + until < 2 * accelDist) {
    if (since < until)
      return (
        2 * Math.sqrt((until + since) / accel) - Math.sqrt((2 * since) / accel)
      );
    return Math.sqrt((2 * until) / accel);
  }
  if (since < accelDist)
    return (
      (until + since) / speed + speed / accel - Math.sqrt((2 * since) / accel)
    );
  if (until < accelDist) return Math.sqrt((2 * until) / accel);
  return until / speed + (0.5 * speed) / accel;
}

function stampFrameTime(
  frames: KeyFrame[],
  i: number,
  pathTime: number,
): number {
  const prev = frames[i - 1];
  const frame = frames[i];
  if (!(prev && frame)) return pathTime;
  let at = pathTime + prev.timeTo;
  if (isStop(frame)) {
    frame.arriveTime = Math.trunc(at * 1000);
    prev.nextArriveTime = frame.arriveTime;
    at += frame.node.delay;
    frame.departureTime = Math.trunc(at * 1000);
    return at;
  }
  at -= frame.timeTo;
  frame.arriveTime = Math.trunc(at * 1000);
  prev.nextArriveTime = frame.arriveTime;
  frame.departureTime = frame.arriveTime;
  return at;
}

function scheduleFrames(init: {
  frames: KeyFrame[];
  lastStop: number;
  speed: number;
  accel: number;
  accelDist: number;
}): number {
  const { frames, lastStop, speed, accel, accelDist } = init;
  for (const frame of frames)
    frame.timeTo = segmentTime(frame, speed, accel, accelDist);
  let segment = 0;
  for (let i = 0; i < frames.length; i++) {
    const j = (i + lastStop) % frames.length;
    const frame = frames[j];
    if (!frame) continue;
    if (isStop(frame) || j === lastStop) segment = frame.timeTo;
    frame.timeFrom = segment - frame.timeTo;
  }
  const first = frames[0];
  if (!first) return 0;
  first.arriveTime = 0;
  let pathTime = 0;
  if (isStop(first)) {
    pathTime = first.node.delay;
    first.departureTime = Math.trunc(pathTime * 1000);
  }
  for (let i = 1; i < frames.length; i++)
    pathTime = stampFrameTime(frames, i, pathTime);
  const last = frames.at(-1);
  if (!last) return 0;
  last.nextArriveTime = last.departureTime;
  return last.departureTime;
}

export class TransportPath {
  readonly period: number;
  private readonly frames: readonly KeyFrame[];
  private readonly speed: number;
  private readonly accel: number;
  private readonly accelTime: number;
  private readonly accelDist: number;

  constructor(init: {
    frames: readonly KeyFrame[];
    period: number;
    speed: number;
    accel: number;
  }) {
    this.frames = init.frames;
    this.period = init.period;
    this.speed = init.speed;
    this.accel = init.accel;
    this.accelTime = init.speed / init.accel;
    this.accelDist = (0.5 * init.speed * init.speed) / init.accel;
  }

  private segmentPosition(frame: KeyFrame, now: number): number {
    const into = now - frame.departureTime / 1000;
    const sinceStop = frame.timeFrom + into;
    const untilStop = frame.timeTo - into;
    const travelled = (time: number) =>
      time < this.accelTime
        ? 0.5 * this.accel * time * time
        : this.accelDist + (time - this.accelTime) * this.speed;
    const along =
      sinceStop < untilStop
        ? travelled(sinceStop) - frame.distSinceStop
        : frame.distUntilStop - travelled(untilStop);
    return along / frame.nextDistFromPrev;
  }

  poseAt(progress: number): TransportPose | undefined {
    if (this.period <= 0) return undefined;
    const timer = Math.floor(progress) % this.period;
    for (const frame of this.frames) {
      const node = frame.node;
      const stopped: TransportPose = {
        mapId: node.mapId,
        x: node.x,
        y: node.y,
        z: node.z,
        orientation: frame.initialOrientation,
        moving: false,
      };
      if (timer >= frame.arriveTime && timer < frame.departureTime)
        return stopped;
      if (timer < frame.departureTime || timer >= frame.nextArriveTime)
        continue;
      const spline = frame.spline;
      if (!spline || frame.nextDistFromPrev <= 0 || frame.index >= spline.hi)
        return stopped;
      const t = this.segmentPosition(frame, timer * 0.001);
      const at = spline.evaluate(frame.index, t);
      const heading = spline.derivative(frame.index, t);
      return {
        mapId: node.mapId,
        x: at[0],
        y: at[1],
        z: at[2],
        orientation: normalizeOrientation(
          Math.atan2(heading[1], heading[0]) + Math.PI,
        ),
        moving: true,
      };
    }
    return undefined;
  }
}

export function generateTransportPath(
  nodes: readonly TaxiNode[],
  speed: number,
  accel: number,
): TransportPath | undefined {
  if (nodes.length < 2 || speed <= 0 || accel <= 0) return undefined;
  const { frames, splinePath } = buildFrames(nodes);
  if (frames.length === 0) return undefined;
  const last = frames.at(-1);
  if (last) last.teleport = true;
  const { firstStop, lastStop } = measureSegments(frames, splinePath);
  spreadStopDistances(frames, firstStop, lastStop);
  const accelDist = (0.5 * speed * speed) / accel;
  const period = scheduleFrames({ accel, accelDist, frames, lastStop, speed });
  return new TransportPath({ accel, frames, period, speed });
}
