import type { Compass, PoseView } from "#harness/contract/views";

export const RING: readonly Compass[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];
export const SEARCH = [0, 1, -1, 2, -2, 3, -3, 4];
const DIAGONAL = Math.SQRT1_2;
export const STEP: Record<Compass, { dx: number; dy: number }> = {
  E: { dx: 0, dy: -1 },
  N: { dx: 1, dy: 0 },
  NE: { dx: DIAGONAL, dy: -DIAGONAL },
  NW: { dx: DIAGONAL, dy: DIAGONAL },
  S: { dx: -1, dy: 0 },
  SE: { dx: -DIAGONAL, dy: -DIAGONAL },
  SW: { dx: -DIAGONAL, dy: DIAGONAL },
  W: { dx: 0, dy: 1 },
};

export function ahead(
  pose: PoseView,
  direction: Compass,
  yards: number,
): { x: number; y: number } {
  const step = STEP[direction];
  return { x: pose.x + step.dx * yards, y: pose.y + step.dy * yards };
}

export function turned(direction: Compass, offset: number): Compass {
  const index = RING.indexOf(direction) + offset;
  return RING[(index + RING.length) % RING.length] ?? direction;
}

export function compassOf({ dx, dy }: { dx: number; dy: number }): Compass {
  const index = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4));
  return RING[(index + RING.length) % RING.length] ?? "N";
}
