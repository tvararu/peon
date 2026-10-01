import type { ControlDeps } from "#wow/control";
import { FLAG_ACKS } from "#wow/control-flag-acks";
import { AIR_INPUT_BITS } from "#wow/control-swim";
import type { Emit, SyncMotion } from "#wow/control-sync-types";
import { MovementFlag } from "#wow/protocol/entity-fields";
import {
  buildCollisionHeightAck,
  buildFlagAck,
  buildMoveMessage,
  buildRootAck,
  buildSpeedAck,
  buildTimeSkipped,
  type ForceSpeed,
  type KnockBack,
  type MoveAck,
  type MovementInfo,
  type SpeedAck,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag } from "#wow/self-store";

export type AckHost = {
  moveFlags: number;
  observedFlags: number;
  runSpeed: number | undefined;
  runBackSpeed: number | undefined;
  turnRate: number;
  fall: MovementInfo["fall"];
  fallTime: number;
  cancelForced: (reason: string) => void;
  moveAck: (counter: number) => MoveAck;
  moverGuid: () => bigint;
  movementInfo: () => MovementInfo;
};

export type AckParts = {
  deps: ControlDeps;
  emit: Emit;
  motion: SyncMotion;
  host: AckHost;
};

export class ServerAckSync {
  private readonly deps: ControlDeps;
  private readonly emit: Emit;
  private readonly motion: SyncMotion;
  private readonly host: AckHost;

  constructor({ deps, emit, motion, host }: AckParts) {
    this.deps = deps;
    this.emit = emit;
    this.motion = motion;
    this.host = host;
  }

  knockBack({ counter, fall }: KnockBack): void {
    this.host.cancelForced("knockback");
    this.host.observedFlags |= MovementFlag.FALLING;
    this.host.moveFlags |= MovementFlag.FALLING;
    this.host.fall = fall;
    this.deps.send(
      GameOpcode.CMSG_MOVE_KNOCK_BACK_ACK,
      buildRootAck(this.host.moveAck(counter)),
    );
    this.emit("server_correction", "knockback");
  }

  forceSpeed(spec: SpeedAck, { counter, speed }: ForceSpeed): void {
    this.motion.settle();
    if ("field" in spec && spec.field === "runSpeed")
      this.host.runSpeed = speed;
    if ("field" in spec && spec.field === "runBackSpeed")
      this.host.runBackSpeed = speed;
    if ("field" in spec && spec.field === "turnRate")
      this.host.turnRate = speed;
    this.deps.send(spec.ack, buildSpeedAck(this.host.moveAck(counter), speed));
  }

  setCanFly(counter: number, enable: boolean): void {
    this.host.cancelForced(enable ? "flying" : "unset_can_fly");
    if (enable) {
      this.host.observedFlags |= MovementFlag.CAN_FLY;
      this.host.moveFlags |= MovementFlag.CAN_FLY;
    } else {
      this.host.observedFlags &= ~(MovementFlag.CAN_FLY | MovementFlag.FLYING);
      this.host.moveFlags &= ~(
        MovementFlag.CAN_FLY |
        MovementFlag.FLYING |
        AIR_INPUT_BITS
      );
    }
    this.deps.send(
      GameOpcode.CMSG_MOVE_SET_CAN_FLY_ACK,
      buildFlagAck(this.host.moveAck(counter), enable),
    );
    this.emit("control_changed", enable ? "flying" : undefined);
  }

  moveFlag(flag: MoveFlag, enable: boolean, counter: number): void {
    const { bit, set, clear, applied } = FLAG_ACKS[flag];
    if (enable) {
      this.host.observedFlags |= bit;
      this.host.moveFlags |= bit;
    } else {
      this.host.observedFlags &= ~bit;
      this.host.moveFlags &= ~bit;
    }
    const ack = this.host.moveAck(counter);
    this.deps.send(
      enable ? set : clear,
      applied ? buildFlagAck(ack, enable) : buildRootAck(ack),
    );
  }

  collisionHeight(counter: number, height: number): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_SET_COLLISION_HGT_ACK,
      buildCollisionHeightAck(this.host.moveAck(counter), height),
    );
  }

  timeSkipped(ms: number): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_TIME_SKIPPED,
      buildTimeSkipped(this.deps.selfGuid(), ms),
    );
  }

  resetFall(): void {
    this.host.fall = undefined;
    this.host.fallTime = 0;
    this.host.observedFlags &= ~MovementFlag.FALLING;
    this.host.moveFlags &= ~MovementFlag.FALLING;
    this.deps.send(
      GameOpcode.CMSG_MOVE_FALL_RESET,
      buildMoveMessage(this.host.moverGuid(), this.host.movementInfo()),
    );
  }
}
