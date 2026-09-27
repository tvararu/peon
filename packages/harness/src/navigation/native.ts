const GEOMETRY_REJECTION = Symbol("navigation_geometry");
type GroundError = Error & { [GEOMETRY_REJECTION]: true };

const ADT_MID = 32 * (533 + 1 / 3);
const ADT_SIZE = Math.fround(533 + 1 / 3);

export type NativePoint = { x: number; y: number; z: number };

export type NativeMap = {
  loadAdtAt: (x: number, y: number) => void;
  findHeights: (x: number, y: number) => number[];
  findHeight: (from: NativePoint, x: number, y: number) => number;
  lineOfSight: (from: NativePoint, to: NativePoint) => boolean;
  findPath: (from: NativePoint, to: NativePoint) => NativePoint[];
  close: () => void;
};

export type NavigationSource = {
  open: (mapId: number) => NativeMap;
  covers: (mapId: number) => boolean;
};

export function validateNativePoint(point: NativePoint): void {
  validateNativeXY(point.x, point.y);
  if (!Number.isFinite(Math.fround(point.z)))
    throw new Error("invalid native coordinate z");
}

export function validateNativeXY(x: number, y: number): void {
  if (!(insideAdts(x) && insideAdts(y)))
    throw new Error("native coordinate outside the 64x64 ADT domain");
}

function insideAdts(value: number): boolean {
  const coordinate = Math.fround(value);
  const index = (ADT_MID - coordinate) / ADT_SIZE;
  return (
    Number.isFinite(coordinate) &&
    Math.abs(value) <= ADT_MID &&
    index >= 0 &&
    index < 64
  );
}

export function groundError(message: string): GroundError {
  return Object.assign(new Error(message), {
    [GEOMETRY_REJECTION]: true as const,
  });
}

export function isGroundError(error: unknown): error is GroundError {
  return (
    error instanceof Error &&
    GEOMETRY_REJECTION in error &&
    error[GEOMETRY_REJECTION] === true
  );
}
