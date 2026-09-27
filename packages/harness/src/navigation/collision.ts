import { collisionFree, WALKABLE_CLIMB } from "@peon/core";
import {
  groundError,
  type NativeMap,
  type NativePoint,
} from "#harness/navigation/native";

export const START_SNAP = WALKABLE_CLIMB;

export function checkCollision(
  map: NativeMap,
  from: NativePoint,
  to: NativePoint,
  climb: number,
): void {
  const ray = (a: NativePoint, b: NativePoint) =>
    (a.x === b.x && a.y === b.y && a.z === b.z) || map.lineOfSight(a, b);
  if (!collisionFree(ray, from, to, climb))
    throw groundError("ground corridor collision");
}
