import type { ControlDeps, ControlEventType, ControlPose } from "#wow/control";
import { FLAG_ACKS } from "#wow/control-flag-acks";
import {
  DEFAULT_TURN_RATE,
  INPUT_BITS,
  type MovementInput,
} from "#wow/control-input";
import { unsupportedReason } from "#wow/control-motion";
import { VERTICAL_BITS } from "#wow/control-swim";
import type { Position } from "#wow/entity-store";
import { MovementFlag, UnitFlag } from "#wow/protocol/entity-fields";
import type { MonsterMove } from "#wow/protocol/monster-move";
import {
  buildCollisionHeightAck,
  buildFlagAck,
  buildMoveMessage,
  buildRootAck,
  buildSetActiveMover,
  buildSpeedAck,
  buildTeleportAck,
  buildTimeSkipped,
  type ClientControl,
  type FallData,
  type ForceSpeed,
  type KnockBack,
  type MoveAck,
  type MovementInfo,
  type SpeedAck,
  type TransportInfo,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag, TransferAbortedInput } from "#wow/self-store";

export const TRANSFER_ABORT_TIMEOUT_MS = 10_000;

const UNIT_BLOCK_FLAGS =
  UnitFlag.DISABLE_MOVE |
  UnitFlag.STUNNED |
  UnitFlag.CONFUSED |
  UnitFlag.FLEEING;

export type Emit = (type: ControlEventType, reason?: string) => void;

export type SyncMotion = {
  moving: () => boolean;
  settle: () => void;
  abort: (reason: string) => void;
  stop: (reason: string) => void;
};

export type SelfObservation = {
  position?: Position;
  movementFlags?: number;
  runSpeed?: number;
  runBackSpeed?: number;
  turnRate?: number;
  target?: bigint;
  unitFlags?: number;
};

export type SyncParts = {
  deps: ControlDeps;
  emit: Emit;
  motion: SyncMotion;
  flight?: FlightPort | undefined;
};
export type FlightPort = {
  inFlight: () => boolean;
  newWorld: () => void;
  observeSpline: (move: MonsterMove) => boolean;
  observeUnitFlags: (unitFlags: number) => boolean;
};

export class MovementSync {
  predicted: ControlPose | undefined;
  server: ControlPose | undefined;
  moveFlags = 0;
  mapId = 0;
  runSpeed: number | undefined;
  runBackSpeed: number | undefined;
  turnRate = DEFAULT_TURN_RATE;
  fall: FallData | undefined;
  fallTime = 0;
  pitch: number | undefined;
  target: bigint | undefined;
  private readonly deps: ControlDeps;
  private readonly emit: Emit;
  private readonly motion: SyncMotion;
  private extraFlags = 0;
  private flight: FlightPort | undefined;
  private observedFlags = 0;
  private transport: TransportInfo | undefined;
  private controlAllowed = true;
  private rooted = false;
  private teleporting = false;
  private unitBlocked = false;
  private transferAbortTimer: ReturnType<typeof setTimeout> | undefined;

  constructor({ deps, emit, motion, flight }: SyncParts) {
    this.deps = deps;
    this.emit = emit;
    this.motion = motion;
    this.flight = flight;
  }

  pose(): ControlPose | undefined {
    return this.predicted ?? this.server;
  }

  requirePose(): ControlPose {
    const pose = this.pose();
    if (!pose) throw new Error("no_pose");
    return { ...pose };
  }

  speedFor(input: MovementInput): number | undefined {
    return input.move === "backward" ? this.runBackSpeed : this.runSpeed;
  }

  blockReason(): string | undefined {
    return (
      this.airBlock() ??
      unsupportedReason(
        this.observedFlags |
          (this.moveFlags & (MovementFlag.SWIMMING | MovementFlag.FLYING)),
      )
    );
  }

  airBlock(): string | undefined {
    if (this.teleporting) return "teleporting";
    if (this.flight?.inFlight() ?? false) return "in_flight";
    if (this.rooted) return "rooted";
    if (!this.controlAllowed) return "no_control";
    if (this.unitBlocked) return "disable_move";
    return undefined;
  }

  canFly(): boolean {
    return ((this.observedFlags | this.moveFlags) & MovementFlag.CAN_FLY) !== 0;
  }

  setFlight(flight: FlightPort): void {
    this.flight = flight;
  }

  restoreFlightBlocker(blockers: number): void {
    this.unitBlocked = (blockers & UNIT_BLOCK_FLAGS) !== 0;
  }

  setFlightPose(pose: Position): void {
    this.setServerPose(pose);
    this.predicted = undefined;
  }
  observeSelfSpline(move: MonsterMove): void {
    this.flight?.observeSpline(move);
  }

  movementInfo(): MovementInfo {
    const pose = this.pose();
    return {
      flags: this.moveFlags,
      extraFlags: this.extraFlags,
      time: this.deps.ticks(),
      x: pose?.x ?? 0,
      y: pose?.y ?? 0,
      z: pose?.z ?? 0,
      orientation: pose?.orientation ?? 0,
      fallTime: this.fallTime,
      pitch: this.pitch,
      fall: this.fall,
      transport: this.transport,
    };
  }

  loginVerified(position: Position): void {
    this.mapId = position.mapId;
    this.setServerPose(position);
    this.predicted = undefined;
    this.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(this.deps.selfGuid()),
    );
  }

  observeSelf(input: SelfObservation): void {
    if (input.runSpeed !== undefined) this.runSpeed = input.runSpeed;
    if (input.runBackSpeed !== undefined)
      this.runBackSpeed = input.runBackSpeed;
    if (input.turnRate !== undefined) this.turnRate = input.turnRate;
    if (input.unitFlags !== undefined) this.setUnitFlags(input.unitFlags);
    if (input.target !== undefined) this.observeTarget(input.target);
    if (input.movementFlags !== undefined) {
      this.observedFlags = input.movementFlags;
      this.rooted = (input.movementFlags & MovementFlag.ROOT) !== 0;
      if (this.rooted) this.moveFlags |= MovementFlag.ROOT;
      else this.moveFlags &= ~MovementFlag.ROOT;
    }
    if (input.position) {
      const stamped = {
        ...input.position,
        mapId: this.mapId || input.position.mapId,
      };
      this.server = {
        ...stamped,
        source: "server",
        updatedAt: this.deps.now(),
      };
      if (this.motion.moving()) {
        this.motion.abort("server_correction");
        this.predicted = undefined;
        this.emit("server_correction", "observed");
        return;
      }
      this.predicted = undefined;
    }
    const unsafe = this.blockReason();
    if (this.motion.moving() && unsafe) this.motion.abort(unsafe);
  }

  observeTarget(target: bigint): void {
    if (this.target === target) return;
    this.target = target;
    this.emit("target_observed");
  }

  teleportAck({ counter, info: dest }: MoveAck): void {
    this.cancelTransferAbortWatch();
    this.teleporting = false;
    this.motion.abort("teleport");
    this.deps.send(
      GameOpcode.MSG_MOVE_TELEPORT_ACK,
      buildTeleportAck(this.deps.selfGuid(), counter, this.deps.ticks()),
    );
    this.applyForcedPose(dest, "teleport");
  }

  nearTeleport(dest: MovementInfo): void {
    this.cancelTransferAbortWatch();
    this.teleporting = false;
    this.motion.abort("near_teleport");
    this.applyForcedPose(dest, "near_teleport");
  }

  handleTransferPending(): void {
    this.cancelTransferAbortWatch();
    this.teleporting = true;
    this.motion.abort("teleport");
    this.emit("control_changed", "teleporting");
  }

  transferAborted(_abort: TransferAbortedInput): void {
    if (!this.teleporting) return;
    this.cancelTransferAbortWatch();
    this.transferAbortTimer = setTimeout(() => {
      this.transferAbortTimer = undefined;
      this.teleporting = false;
      this.motion.stop("transfer_aborted");
      this.emit("control_changed", undefined);
    }, TRANSFER_ABORT_TIMEOUT_MS);
  }

  private cancelTransferAbortWatch(): void {
    if (this.transferAbortTimer !== undefined)
      clearTimeout(this.transferAbortTimer);
    this.transferAbortTimer = undefined;
  }

  dispose(): void {
    this.cancelTransferAbortWatch();
  }

  newWorld(position: Position): void {
    this.cancelTransferAbortWatch();
    this.teleporting = false;
    this.flight?.newWorld();
    this.motion.abort("teleport");
    this.mapId = position.mapId;
    this.moveFlags = 0;
    this.observedFlags = 0;
    this.extraFlags = 0;
    this.fall = undefined;
    this.pitch = undefined;
    this.fallTime = 0;
    this.transport = undefined;
    this.rooted = false;
    this.setServerPose(position);
    this.predicted = undefined;
    this.deps.send(GameOpcode.MSG_MOVE_WORLDPORT_ACK);
    this.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(this.deps.selfGuid()),
    );
    this.emit("server_correction", "new_world");
  }

  forceRoot(counter: number): void {
    this.rooted = true;
    this.motion.abort("root");
    this.moveFlags |= MovementFlag.ROOT;
    this.ackRoot(GameOpcode.CMSG_FORCE_MOVE_ROOT_ACK, counter);
    this.emit("control_changed", "rooted");
  }

  forceUnroot(counter: number): void {
    this.rooted = false;
    this.moveFlags &= ~MovementFlag.ROOT;
    this.ackRoot(GameOpcode.CMSG_FORCE_MOVE_UNROOT_ACK, counter);
    this.emit("control_changed", undefined);
  }

  knockBack({ counter, fall }: KnockBack): void {
    this.motion.abort("knockback");
    this.observedFlags |= MovementFlag.FALLING;
    this.moveFlags |= MovementFlag.FALLING;
    this.fall = fall;
    this.ackRoot(GameOpcode.CMSG_MOVE_KNOCK_BACK_ACK, counter);
    this.emit("server_correction", "knockback");
  }

  clientControl({ guid, allow }: ClientControl): void {
    const self = this.deps.selfGuid();
    if (guid !== 0n && guid !== self) {
      this.controlAllowed = false;
      this.motion.abort("no_control");
      this.emit("control_changed", "no_control");
      return;
    }
    this.controlAllowed = allow;
    if (!allow) this.motion.abort("no_control");
    this.emit("control_changed", allow ? undefined : "no_control");
  }

  forceSpeed(spec: SpeedAck, { counter, speed }: ForceSpeed): void {
    this.motion.settle();
    if ("field" in spec && spec.field === "runSpeed") this.runSpeed = speed;
    if ("field" in spec && spec.field === "runBackSpeed")
      this.runBackSpeed = speed;
    if ("field" in spec && spec.field === "turnRate") this.turnRate = speed;
    this.deps.send(spec.ack, buildSpeedAck(this.moveAck(counter), speed));
  }

  setCanFly(counter: number, enable: boolean): void {
    this.motion.abort(enable ? "flying" : "unset_can_fly");
    if (enable) {
      this.observedFlags |= MovementFlag.CAN_FLY;
      this.moveFlags |= MovementFlag.CAN_FLY;
    } else {
      this.observedFlags &= ~(MovementFlag.CAN_FLY | MovementFlag.FLYING);
      this.moveFlags &= ~(
        MovementFlag.CAN_FLY |
        MovementFlag.FLYING |
        VERTICAL_BITS
      );
    }
    this.deps.send(
      GameOpcode.CMSG_MOVE_SET_CAN_FLY_ACK,
      buildFlagAck(this.moveAck(counter), enable),
    );
    this.emit("control_changed", enable ? "flying" : undefined);
  }

  moveFlag(flag: MoveFlag, enable: boolean, counter: number): void {
    const { bit, set, clear, applied } = FLAG_ACKS[flag];
    if (enable) {
      this.observedFlags |= bit;
      this.moveFlags |= bit;
    } else {
      this.observedFlags &= ~bit;
      this.moveFlags &= ~bit;
    }
    const ack = this.moveAck(counter);
    this.deps.send(
      enable ? set : clear,
      applied ? buildFlagAck(ack, enable) : buildRootAck(ack),
    );
  }

  collisionHeight(counter: number, height: number): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_SET_COLLISION_HGT_ACK,
      buildCollisionHeightAck(this.moveAck(counter), height),
    );
  }

  timeSkipped(ms: number): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_TIME_SKIPPED,
      buildTimeSkipped(this.deps.selfGuid(), ms),
    );
  }

  resetFall(): void {
    this.fall = undefined;
    this.fallTime = 0;
    this.observedFlags &= ~MovementFlag.FALLING;
    this.moveFlags &= ~MovementFlag.FALLING;
    this.deps.send(
      GameOpcode.CMSG_MOVE_FALL_RESET,
      buildMoveMessage(this.deps.selfGuid(), this.movementInfo()),
    );
  }

  private ackRoot(opcode: number, counter: number): void {
    this.deps.send(opcode, buildRootAck(this.moveAck(counter)));
  }

  private moveAck(counter: number): MoveAck {
    return { guid: this.deps.selfGuid(), counter, info: this.movementInfo() };
  }

  private setServerPose(position: Position): void {
    this.server = { ...position, source: "server", updatedAt: this.deps.now() };
  }

  private applyForcedPose(dest: MovementInfo, reason: string): void {
    this.observedFlags = dest.flags;
    this.extraFlags = dest.extraFlags;
    this.moveFlags = dest.flags & ~INPUT_BITS;
    this.fall = dest.fall;
    this.pitch = dest.pitch;
    this.transport = dest.transport;
    this.rooted = (dest.flags & MovementFlag.ROOT) !== 0;
    this.setServerPose({
      mapId: this.mapId,
      x: dest.x,
      y: dest.y,
      z: dest.z,
      orientation: dest.orientation,
    });
    this.predicted = undefined;
    this.emit("server_correction", reason);
  }

  private setUnitFlags(unitFlags: number): void {
    const wasFlying = this.flight?.inFlight() ?? false;
    const wasBlocked = this.unitBlocked;
    const blocked = (unitFlags & UNIT_BLOCK_FLAGS) !== 0;
    if (!wasFlying) this.unitBlocked = blocked;
    this.flight?.observeUnitFlags(unitFlags);
    if (this.flight?.inFlight() ?? false) return;
    if (wasFlying || blocked === wasBlocked) return;
    if (blocked) this.motion.stop("disable_move");
    this.emit("control_changed", blocked ? "disable_move" : undefined);
  }
}
