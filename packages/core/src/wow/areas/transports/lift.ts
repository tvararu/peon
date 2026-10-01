import {
  type DbcFile,
  type DbcSource,
  type DbcSpec,
  f32,
  openDbc,
  u32,
} from "#wow/dbc";

export const TRANSPORT_ANIMATION_LAYOUT = {
  file: "TransportAnimation.dbc",
  fields: 7,
  recordSize: 28,
} as const satisfies DbcSpec;

export const TRANSPORT_ROTATION_LAYOUT = {
  file: "TransportRotation.dbc",
  fields: 7,
  recordSize: 28,
} as const satisfies DbcSpec;

type Stationary = { x: number; y: number; z: number; orientation: number };

type AnimNode = { timeSeg: number; x: number; y: number; z: number };

export type LiftRotation = {
  nodes: { timeSeg: number; w: number; z: number }[];
  totalTime: number;
};

export type LiftModel = {
  nodes: readonly AnimNode[];
  totalTime: number;
  rotations?: LiftRotation | undefined;
};

function readNodes(file: DbcFile): Map<number, Map<number, AnimNode>> {
  const byEntry = new Map<number, Map<number, AnimNode>>();
  for (let row = 0; row < file.recordCount; row++) {
    const entry = u32(file, row, 1);
    const columns = byEntry.get(entry) ?? new Map<number, AnimNode>();
    const timeSeg = u32(file, row, 2);
    columns.set(timeSeg, {
      timeSeg,
      x: f32(file, row, 3),
      y: f32(file, row, 4),
      z: f32(file, row, 5),
    });
    byEntry.set(entry, columns);
  }
  return byEntry;
}

function readRotations(file: DbcFile): Map<number, LiftRotation> {
  const byEntry = new Map<number, LiftRotation>();
  for (let row = 0; row < file.recordCount; row++) {
    const timeSeg = u32(file, row, 2);
    const current = byEntry.get(u32(file, row, 1)) ?? {
      nodes: [],
      totalTime: 0,
    };
    current.nodes.push({
      timeSeg,
      z: f32(file, row, 5),
      w: f32(file, row, 6),
    });
    current.totalTime = Math.max(current.totalTime, timeSeg);
    byEntry.set(u32(file, row, 1), current);
  }
  for (const rotation of byEntry.values())
    rotation.nodes.sort(
      (a: { timeSeg: number }, b: { timeSeg: number }) => a.timeSeg - b.timeSeg,
    );
  return byEntry;
}

export async function readLiftAnimations(
  source: DbcSource,
  spec: DbcSpec,
  rotationSpec?: DbcSpec,
): Promise<Map<number, LiftModel>> {
  const file = await openDbc(source, spec);
  const byEntry = readNodes(file);
  const rotations = rotationSpec
    ? readRotations(await openDbc(source, rotationSpec))
    : new Map<number, LiftRotation>();
  const models = new Map<number, LiftModel>();
  for (const [entry, columns] of byEntry) {
    const nodes = [...columns.values()].sort((a, b) => a.timeSeg - b.timeSeg);
    models.set(entry, {
      nodes,
      totalTime: nodes.at(-1)?.timeSeg ?? 0,
      rotations: rotations.get(entry),
    });
  }
  return models;
}

function animNodeAt(
  nodes: readonly AnimNode[],
  progress: number,
): { curr: AnimNode; next: AnimNode; ratio: number } | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const curr = nodes[i];
    if (!curr || progress < curr.timeSeg) continue;
    const next = nodes[i + 1];
    if (!next) return undefined;
    return {
      curr,
      next,
      ratio: (progress - curr.timeSeg) / (next.timeSeg - curr.timeSeg),
    };
  }
  return undefined;
}

function rotationAngleAt(
  rotation: LiftRotation | undefined,
  progress: number,
): number {
  if (!rotation || rotation.nodes.length === 0) return 0;
  const at = (node: { w: number; z: number }) =>
    (node.z >= 0 ? 1 : -1) * 2 * Math.acos(node.w);
  for (let i = rotation.nodes.length - 1; i >= 0; i--) {
    const curr = rotation.nodes[i];
    if (!curr || progress < curr.timeSeg) continue;
    const next = rotation.nodes[i + 1] ?? rotation.nodes[0];
    if (!next) return at(curr);
    const end = rotation.nodes[i + 1] ? next.timeSeg : rotation.totalTime;
    if (end <= curr.timeSeg) return at(curr);
    const ratio = (progress - curr.timeSeg) / (end - curr.timeSeg);
    return at(curr) + ratio * (at(next) - at(curr));
  }
  return 0;
}

export function liftPoseAt(
  anim: LiftModel,
  progress: number,
  stationary: Stationary,
  pathRotation: number,
): (Stationary & { moving: boolean }) | undefined {
  if (anim.totalTime <= 0 || anim.nodes.length === 0) return undefined;
  const wrapped = Math.floor(progress) % anim.totalTime;
  const segment = animNodeAt(anim.nodes, wrapped);
  if (!segment) return undefined;
  const offset = {
    x: segment.curr.x + segment.ratio * (segment.next.x - segment.curr.x),
    y: segment.curr.y + segment.ratio * (segment.next.y - segment.curr.y),
    z: segment.curr.z + segment.ratio * (segment.next.z - segment.curr.z),
  };
  const cos = Math.cos(pathRotation);
  const sin = Math.sin(pathRotation);
  const rotated = {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
    z: offset.z,
  };
  const orientation =
    stationary.orientation + rotationAngleAt(anim.rotations, wrapped);
  return {
    x: stationary.x + rotated.x,
    y: stationary.y + rotated.y,
    z: stationary.z + rotated.z,
    orientation,
    moving: true,
  };
}
