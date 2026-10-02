import type { GroundOracle } from "#wow/control-motion";
import type { Position } from "#wow/entity-store";
import type { Vec3 } from "#wow/protocol/packet";

export const BOARD_RANGE_YD = 30;

export type DeckPose = Position & { moving: boolean };

export type TransportBoard = {
  guid: bigint;
  poseAt: (now: number) => DeckPose | undefined;
};

export type TransportRide = {
  guid: bigint;
  offset: Vec3;
  mapId: number;
  pose: DeckPose | undefined;
  poseAt: (now: number) => DeckPose | undefined;
};

export function planBoard(
  board: TransportBoard,
  from: Position,
  now: number,
): TransportRide {
  const at = board.poseAt(now);
  if (!at || at.mapId !== from.mapId) throw new Error("transport_data_missing");
  if (at.moving) throw new Error("not_docked");
  const dx = from.x - at.x;
  const dy = from.y - at.y;
  if (Math.hypot(dx, dy) > BOARD_RANGE_YD) throw new Error("too_far");
  const cos = Math.cos(-at.orientation);
  const sin = Math.sin(-at.orientation);
  return {
    guid: board.guid,
    offset: {
      x: dx * cos - dy * sin,
      y: dy * cos + dx * sin,
      z: from.z - at.z,
    },
    mapId: at.mapId,
    pose: { ...at },
    poseAt: board.poseAt,
  };
}

export function planLeave(
  ride: TransportRide,
  mapId: number,
  ground: GroundOracle | undefined,
): Position {
  const at = ride.pose;
  if (!at || at.mapId !== mapId || at.moving) throw new Error("not_docked");
  const z = ground?.height(mapId, at.x, at.y, { x: at.x, y: at.y, z: at.z });
  if (z === undefined) throw new Error("ground_height_unavailable");
  return { mapId, orientation: at.orientation, x: at.x, y: at.y, z };
}
