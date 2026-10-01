import type { ControlDeps } from "#wow/control";
import { FLAG_ACKS } from "#wow/control-flag-acks";
import {
  buildCollisionHeightAck,
  buildFlagAck,
  buildRootAck,
  buildSpeedAck,
  buildTimeSkipped,
  type MoveAck,
  type SpeedAck,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag } from "#wow/self-store";

export type Timer = ReturnType<typeof setTimeout>;

export class ForcedAcks {
  private readonly deps: ControlDeps;
  private readonly moveAck: (counter: number) => MoveAck;

  constructor(deps: ControlDeps, moveAck: (counter: number) => MoveAck) {
    this.deps = deps;
    this.moveAck = moveAck;
  }

  root(opcode: number, counter: number): void {
    this.deps.send(opcode, buildRootAck(this.moveAck(counter)));
  }

  speed(spec: SpeedAck, counter: number, speed: number): void {
    this.deps.send(spec.ack, buildSpeedAck(this.moveAck(counter), speed));
  }

  canFly(counter: number, enable: boolean): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_SET_CAN_FLY_ACK,
      buildFlagAck(this.moveAck(counter), enable),
    );
  }

  flag(flag: MoveFlag, enable: boolean, counter: number): void {
    const { set, clear, applied } = FLAG_ACKS[flag];
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
}

export class TransferAbortWatch {
  private timer: Timer | undefined;

  start(onTimeout: () => void, timeoutMs: number): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      onTimeout();
    }, timeoutMs);
  }

  cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
