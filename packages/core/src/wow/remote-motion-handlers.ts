import { MOTION_FLAG_BITS } from "#wow/areas/unitmotion/protocol";
import { ROOT_CLEARS } from "#wow/areas/unitmotion/store";
import { type TraceOutcome, traceIn } from "#wow/packet-trace";
import type { SpeedKind } from "#wow/protocol/movement-block";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import {
  isRemoteMovementOpcode,
  parseCompressedMoves,
  parseRemoteMovementBody,
  REMOTE_MOVEMENT_OPCODES,
  type RemoteMovementBody,
} from "#wow/protocol/remote-movement";
import type { SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";

type RemoteStores = Pick<SessionStores, "areas" | "motion" | "self">;

const MOVE_SPEED_KIND: ReadonlyMap<number, SpeedKind> = new Map([
  [GameOpcode.MSG_MOVE_SET_WALK_SPEED, "walk"],
  [GameOpcode.MSG_MOVE_SET_RUN_SPEED, "run"],
  [GameOpcode.MSG_MOVE_SET_RUN_BACK_SPEED, "run_back"],
  [GameOpcode.MSG_MOVE_SET_SWIM_SPEED, "swim"],
  [GameOpcode.MSG_MOVE_SET_SWIM_BACK_SPEED, "swim_back"],
  [GameOpcode.MSG_MOVE_SET_TURN_RATE, "turn"],
  [GameOpcode.MSG_MOVE_SET_FLIGHT_SPEED, "flight"],
  [GameOpcode.MSG_MOVE_SET_FLIGHT_BACK_SPEED, "flight_back"],
  [GameOpcode.MSG_MOVE_SET_PITCH_RATE, "pitch"],
]);

export function observeRemoteMovement(
  conn: WorldConn,
  { areas, motion, self }: RemoteStores,
  { opcode, guid }: { opcode: number; guid: bigint },
  r: PacketReader,
): void {
  let body: RemoteMovementBody;
  try {
    body = parseRemoteMovementBody(opcode, r);
  } catch (error) {
    conn.remoteMotion.invalidate(guid, "malformed");
    throw error;
  }
  if (body.kind === "time_skipped") {
    conn.remoteMotion.invalidate(guid, "time_skipped");
    return;
  }
  const { info, transition } = body;
  const position = {
    mapId: self.mapId,
    x: info.x,
    y: info.y,
    z: info.z,
    orientation: info.orientation,
  };
  const source = "observer";
  conn.remoteMotion.observe(guid, { position, source, info, transition });
  conn.entityStore.setPosition(guid, position);
  motion.observe(guid, position, undefined, "movement");
  const kind = MOVE_SPEED_KIND.get(opcode);
  if (kind !== undefined && body.speed !== undefined)
    areas.unitmotion.receiveMoveSpeed(guid, kind, body.speed);
}

export function handleCompressedMoves(conn: WorldConn, r: PacketReader): void {
  let failure: unknown;
  for (const move of parseCompressedMoves(r)) {
    const supported =
      isRemoteMovementOpcode(move.opcode) ||
      move.opcode === GameOpcode.SMSG_MONSTER_MOVE;
    let outcome: TraceOutcome = supported ? "error" : "skipped";
    try {
      if (supported)
        outcome = conn.dispatch.handle(
          move.opcode,
          new PacketReader(move.body),
        );
    } catch (error) {
      failure ??= error;
    }
    traceIn(conn.trace, { ...move, outcome, via: "compressed" });
  }
  if (failure) throw failure;
}

export function registerRemoteMotionHandlers(
  conn: WorldConn,
  stores: RemoteStores,
): void {
  for (const opcode of REMOTE_MOVEMENT_OPCODES) {
    if (opcode === GameOpcode.MSG_MOVE_TELEPORT) continue;
    conn.dispatch.on(opcode, (r) =>
      observeRemoteMovement(
        conn,
        stores,
        { opcode, guid: r.packedGuidBig() },
        r,
      ),
    );
  }
  conn.dispatch.on(GameOpcode.SMSG_COMPRESSED_MOVES, (r) =>
    handleCompressedMoves(conn, r),
  );
  conn.events?.area?.subscribe((event) => {
    if (
      event.area !== "unitmotion" ||
      event.event.type !== "flag" ||
      event.event.self
    )
      return;
    const { guid, flag, on } = event.event;
    const known = conn.remoteMotion.pose(guid)?.flags;
    if (known === undefined) return;
    const bit = MOTION_FLAG_BITS[flag];
    const base = on && flag === "root" ? known & ~ROOT_CLEARS : known;
    conn.remoteMotion.applyFlags(guid, (on ? base | bit : base & ~bit) >>> 0);
  });
}
