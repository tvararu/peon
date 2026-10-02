import type { ControlDeps, ControlPose } from "#wow/control";
import type { RideState } from "#wow/control-ride";
import type { TransferAbortWatch } from "#wow/control-sync-guards";
import type { Emit, FlightPort, SyncMotion } from "#wow/control-sync-types";
import {
  planBoard,
  planLeave,
  type TransportBoard,
} from "#wow/control-transport";
import type { Position } from "#wow/entity-store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import {
  buildMoveMessage,
  buildSetActiveMover,
  buildTeleportAck,
  type FallData,
  type MoveAck,
  type MovementInfo,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { TransferAbortedInput } from "#wow/self-store";

export type TransferHost = {
  readonly deps: ControlDeps;
  readonly emit: Emit;
  readonly motion: SyncMotion;
  readonly ride: RideState;
  readonly transferAbort: TransferAbortWatch;
  readonly pendingRoots: Map<bigint, boolean>;
  flight: FlightPort | undefined;
  mapId: number;
  moveFlags: number;
  observedFlags: number;
  drivenFlags: number;
  vehicleCanFly: boolean;
  extraFlags: number;
  fall: FallData | undefined;
  fallTime: number;
  pitch: number | undefined;
  rooted: boolean;
  moverRooted: boolean;
  moverRootKnown: boolean;
  teleporting: boolean;
  transportTransfer: boolean;
  transport: unknown;
  server: ControlPose | undefined;
  predicted: unknown;
  cancelForced: (reason: string) => void;
  applyForcedPose: (dest: MovementInfo, reason: string) => void;
  setServerPose: (position: Position) => void;
  adoptServerPose: (position: Position) => void;
  pose: () => Position | undefined;
  movementInfo: () => MovementInfo;
};

export class WorldTransfer {
  private readonly host: TransferHost;

  constructor(host: TransferHost) {
    this.host = host;
  }

  teleportAck({ counter, info: dest }: MoveAck): void {
    const host = this.host;
    host.transferAbort.cancel();
    host.teleporting = false;
    host.cancelForced("teleport");
    host.deps.send(
      GameOpcode.MSG_MOVE_TELEPORT_ACK,
      buildTeleportAck(host.deps.selfGuid(), counter, host.deps.ticks()),
    );
    host.applyForcedPose(dest, "teleport");
  }

  nearTeleport(dest: MovementInfo): void {
    const host = this.host;
    host.transferAbort.cancel();
    host.teleporting = false;
    host.cancelForced("near_teleport");
    host.applyForcedPose(dest, "near_teleport");
  }

  handleTransferPending(transport?: { entry: number; fromMap: number }): void {
    const host = this.host;
    host.transferAbort.cancel();
    host.teleporting = true;
    host.transportTransfer = transport !== undefined;
    host.cancelForced("teleport");
    host.emit("control_changed", "teleporting");
  }

  transferAborted(_abort: TransferAbortedInput): void {
    const host = this.host;
    if (!host.teleporting) return;
    host.transferAbort.start(() => {
      host.teleporting = false;
      host.motion.stop("transfer_aborted");
      host.emit("control_changed", undefined);
    });
  }

  newWorld(position: Position): void {
    const host = this.host;
    const ride = host.ride;
    host.transferAbort.cancel();
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
    host.drivenFlags = 0;
    host.vehicleCanFly = false;
    host.extraFlags = 0;
    host.fall = undefined;
    host.pitch = undefined;
    host.fallTime = 0;
    host.rooted = false;
    host.moverRooted = false;
    host.moverRootKnown = false;
    host.pendingRoots.clear();
    if (!transfer) host.setServerPose(position);
    else if (host.server) host.server = { ...host.server, stale: true };
    host.predicted = undefined;
    host.deps.send(GameOpcode.MSG_MOVE_WORLDPORT_ACK);
    host.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(host.deps.selfGuid()),
    );
    host.emit("server_correction", "new_world");
  }

  transportBoard(board: TransportBoard): void {
    const host = this.host;
    const from = host.pose();
    if (!from) throw new Error("no_pose");
    const plan = planBoard(board, from, host.deps.now());
    host.transport = undefined;
    host.ride.boardTransport(plan);
    host.moveFlags |= MovementFlag.ON_TRANSPORT;
    host.observedFlags |= MovementFlag.ON_TRANSPORT;
    const body = buildMoveMessage(host.deps.selfGuid(), host.movementInfo());
    host.deps.send(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT, body);
  }

  transportLeave(): void {
    const host = this.host;
    host.ride.refreshPose();
    const ride = host.ride.carriage();
    if (!ride) throw new Error("not_boarded");
    const dest = planLeave(ride, host.mapId, host.deps.ground);
    host.transport = undefined;
    host.moveFlags &= ~MovementFlag.ON_TRANSPORT;
    host.observedFlags &= ~MovementFlag.ON_TRANSPORT;
    host.adoptServerPose(dest);
    host.motion.stop("transport_leave");
    host.ride.leaveTransport();
    const body = buildMoveMessage(host.deps.selfGuid(), host.movementInfo());
    host.deps.send(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT, body);
  }
}
