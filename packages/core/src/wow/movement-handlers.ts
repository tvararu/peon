import {
  parseClientControl,
  parseForceSpeed,
  parseKnockBack,
  parseMoveCounter,
  parseMovementInfo,
  parseTeleportAck,
  parseWorldPosition,
  SPEED_ACKS,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import {
  observeRemoteMovement,
  registerRemoteMotionHandlers,
} from "#wow/remote-motion-handlers";
import type { SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid } from "#wow/world-handlers";

type MovementStores = Pick<
  SessionStores,
  "areas" | "motion" | "quests" | "self"
>;

function handleNearTeleport(
  conn: WorldConn,
  stores: MovementStores,
  r: PacketReader,
): void {
  const guid = r.packedGuidBig();
  if (guid !== selfGuid(conn)) {
    observeRemoteMovement(
      conn,
      stores,
      { opcode: GameOpcode.MSG_MOVE_TELEPORT, guid },
      r,
    );
    return;
  }
  stores.self.receive({ type: "near_teleport", info: parseMovementInfo(r) });
}

function handleNewWorld(
  conn: WorldConn,
  stores: MovementStores,
  r: PacketReader,
): void {
  stores.self.receive({ type: "new_world", position: parseWorldPosition(r) });
  stores.quests.resetInteraction();
  conn.entityStore.clear();
  conn.remoteMotion.endTransfer();
  stores.quests.observeQuestLog();
}

export function registerMovementHandlers(
  conn: WorldConn,
  stores: MovementStores,
): void {
  const { self } = stores;
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_LOGIN_VERIFY_WORLD, (r) => {
    const position = parseWorldPosition(r);
    self.receive({ type: "login_verified", position });
    conn.remoteMotion.mapChanged(position.mapId);
  });
  on(GameOpcode.MSG_MOVE_TELEPORT, (r) => handleNearTeleport(conn, stores, r));
  on(GameOpcode.MSG_MOVE_TELEPORT_ACK, (r) =>
    self.receive({ type: "teleport_ack", ack: parseTeleportAck(r) }),
  );
  on(GameOpcode.SMSG_TRANSFER_PENDING, (r) => {
    const mapId = r.remaining >= 4 ? r.uint32LE() : 0;
    const entry = r.remaining >= 4 ? r.uint32LE() : undefined;
    const fromMap = r.remaining >= 4 ? r.uint32LE() : undefined;
    if (entry !== undefined && fromMap !== undefined)
      self.receive({
        type: "transfer_pending",
        mapId,
        transport: { entry, fromMap },
      });
    else self.receive({ type: "transfer_pending", mapId });
    conn.remoteMotion.beginTransfer();
  });
  on(GameOpcode.SMSG_NEW_WORLD, (r) => handleNewWorld(conn, stores, r));
  on(GameOpcode.SMSG_FORCE_MOVE_ROOT, (r) => {
    const { counter, guid } = parseMoveCounter(r);
    self.receive({ type: "force_root", counter, guid });
  });
  on(GameOpcode.SMSG_FORCE_MOVE_UNROOT, (r) => {
    const { counter, guid } = parseMoveCounter(r);
    self.receive({ type: "force_unroot", counter, guid });
  });
  on(GameOpcode.SMSG_MOVE_KNOCK_BACK, (r) =>
    self.receive({ type: "knock_back", knock: parseKnockBack(r) }),
  );
  on(GameOpcode.SMSG_CLIENT_CONTROL_UPDATE, (r) =>
    self.receive({ type: "client_control", control: parseClientControl(r) }),
  );
  for (const enable of [true, false])
    on(
      enable
        ? GameOpcode.SMSG_MOVE_SET_CAN_FLY
        : GameOpcode.SMSG_MOVE_UNSET_CAN_FLY,
      (r) =>
        self.receive({
          type: "can_fly",
          counter: parseMoveCounter(r).counter,
          enable,
        }),
    );
  for (const spec of SPEED_ACKS)
    on(spec.smsg, (r) =>
      self.receive({
        type: "force_speed",
        spec,
        force: parseForceSpeed(r, spec),
      }),
    );
  registerRemoteMotionHandlers(conn, stores);
}
