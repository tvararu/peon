import type { MovementSync } from "#wow/control-sync";
import type { Position } from "#wow/entity-store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import {
  buildSetActiveMover,
  buildTeleportAck,
  type MoveAck,
  type MovementInfo,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { TransferAbortedInput } from "#wow/self-store";

export const TRANSFER_ABORT_TIMEOUT_MS = 10_000;

export class WorldTransfer {
  private readonly host: MovementSync;

  constructor(host: MovementSync) {
    this.host = host;
  }

  teleportAck({ counter, info: dest }: MoveAck): void {
    const host = this.host;
    host.abortWatch.cancel();
    host.teleporting = false;
    host.cancelForced("teleport");
    host.deps.send(
      GameOpcode.MSG_MOVE_TELEPORT_ACK,
      buildTeleportAck(host.deps.selfGuid(), counter, host.deps.ticks()),
    );
    this.host.applyForcedPose(dest, "teleport");
  }

  nearTeleport(dest: MovementInfo): void {
    const host = this.host;
    host.abortWatch.cancel();
    host.teleporting = false;
    host.cancelForced("near_teleport");
    this.host.applyForcedPose(dest, "near_teleport");
  }

  handleTransferPending(transport?: { entry: number; fromMap: number }): void {
    const host = this.host;
    host.abortWatch.cancel();
    host.teleporting = true;
    host.transportTransfer = transport !== undefined;
    host.cancelForced("teleport");
    host.emit("control_changed", "teleporting");
  }

  transferAborted(_abort: TransferAbortedInput): void {
    const host = this.host;
    if (!host.teleporting) return;
    host.abortWatch.start(() => {
      host.teleporting = false;
      host.motion.stop("transfer_aborted");
      host.emit("control_changed", undefined);
    }, TRANSFER_ABORT_TIMEOUT_MS);
  }

  newWorld(position: Position): void {
    const host = this.host;
    const ride = host.ride;
    host.abortWatch.cancel();
    host.teleporting = false;
    host.flight?.newWorld();
    host.transport = undefined;
    const carriage = ride.carriage();
    const transfer = host.transportTransfer && carriage !== undefined;
    host.transportTransfer = false;
    if (transfer) {
      ride.rebaseTransport(position.mapId, {
        x: position.x,
        y: position.y,
        z: position.z,
      });
    } else if (carriage === undefined || position.mapId !== host.mapId) {
      ride.clear();
    }
    host.mapId = position.mapId;
    const keep = ride.carriage() === undefined ? 0 : MovementFlag.ON_TRANSPORT;
    host.moveFlags = keep;
    host.observedFlags = keep;
    host.extraFlags = 0;
    host.fall = undefined;
    host.pitch = undefined;
    host.fallTime = 0;
    host.rooted = false;
    this.host.setServerPose(position);
    host.predicted = undefined;
    host.deps.send(GameOpcode.MSG_MOVE_WORLDPORT_ACK);
    host.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(host.deps.selfGuid()),
    );
    host.emit("server_correction", "new_world");
  }
}
