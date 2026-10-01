import type { ControlSend } from "#wow/control";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { buildMoveMessage, type MovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";

export type AirHost = {
  moveFlags: number;
  observedFlags: number;
  pitch: number | undefined;
  movementInfo: () => MovementInfo;
  canFly: () => boolean;
  airBlock: () => string | undefined;
};

export type AirParts = {
  send: ControlSend;
  selfGuid: () => bigint;
  host: AirHost;
  enter: (reason: string) => void;
};

export type PitchKind = "up" | "down" | "stop" | number;
export type AscendKind = "start" | "stop";

const PITCH_BITS = MovementFlag.PITCH_UP | MovementFlag.PITCH_DOWN;
export const VERTICAL_BITS = MovementFlag.ASCENDING | MovementFlag.DESCENDING;
export const AIR_INPUT_BITS =
  PITCH_BITS | MovementFlag.ASCENDING | MovementFlag.DESCENDING;
const MAX_PITCH = Math.PI / 2;

const PITCH_OPCODE = {
  down: GameOpcode.MSG_MOVE_START_PITCH_DOWN,
  stop: GameOpcode.MSG_MOVE_STOP_PITCH,
  up: GameOpcode.MSG_MOVE_START_PITCH_UP,
} as const;

export class AirMoves {
  private readonly send: ControlSend;
  private readonly selfGuid: () => bigint;
  private readonly host: AirHost;
  private readonly enter: (reason: string) => void;

  constructor({ send, selfGuid, host, enter }: AirParts) {
    this.send = send;
    this.selfGuid = selfGuid;
    this.host = host;
    this.enter = enter;
  }

  setSwimming(on: boolean): void {
    this.assertFree();
    if (this.stateOf(MovementFlag.SWIMMING) === on) return;
    this.enter("swimming");
    if (on) {
      this.host.moveFlags |= MovementFlag.SWIMMING;
      this.emit(GameOpcode.MSG_MOVE_START_SWIM);
      return;
    }
    this.host.moveFlags &= ~MovementFlag.SWIMMING;
    this.host.observedFlags &= ~MovementFlag.SWIMMING;
    this.leaveIfGrounded();
    this.emit(GameOpcode.MSG_MOVE_STOP_SWIM);
  }

  setFlying(on: boolean): void {
    this.assertFree();
    if (on && !this.host.canFly()) throw new Error("cannot_fly");
    if (this.stateOf(MovementFlag.FLYING) === on) return;
    this.enter("flying");
    if (on) this.host.moveFlags |= MovementFlag.FLYING;
    else {
      const off = MovementFlag.FLYING | MovementFlag.CAN_FLY | VERTICAL_BITS;
      this.host.moveFlags &= ~off;
      this.host.observedFlags &= ~off;
    }
    this.leaveIfGrounded();
    this.emit(GameOpcode.CMSG_MOVE_SET_FLY);
  }

  pitch(kind: PitchKind): void {
    this.assertFree();
    this.assertPitching();
    if (typeof kind === "number") {
      if (!Number.isFinite(kind) || Math.abs(kind) > MAX_PITCH)
        throw new Error("invalid_pitch");
      this.host.pitch = kind;
      this.emit(GameOpcode.MSG_MOVE_SET_PITCH);
      return;
    }
    this.host.moveFlags &= ~PITCH_BITS;
    if (kind === "up") this.host.moveFlags |= MovementFlag.PITCH_UP;
    if (kind === "down") this.host.moveFlags |= MovementFlag.PITCH_DOWN;
    this.emit(PITCH_OPCODE[kind]);
  }

  ascend(kind: AscendKind): void {
    this.assertFree();
    this.assertFlying();
    this.host.moveFlags &= ~VERTICAL_BITS;
    if (kind === "start") this.host.moveFlags |= MovementFlag.ASCENDING;
    this.emit(
      kind === "start"
        ? GameOpcode.MSG_MOVE_START_ASCEND
        : GameOpcode.MSG_MOVE_STOP_ASCEND,
    );
  }

  descend(): void {
    this.assertFree();
    this.assertFlying();
    this.host.moveFlags =
      (this.host.moveFlags & ~VERTICAL_BITS) | MovementFlag.DESCENDING;
    this.emit(GameOpcode.MSG_MOVE_START_DESCEND);
  }

  stopActiveInputs(): void {
    const flags = this.host.moveFlags & AIR_INPUT_BITS;
    if (flags === 0) return;
    if (flags & VERTICAL_BITS) this.ascendLikeStop();
    if (flags & PITCH_BITS) this.pitchLikeStop();
  }

  private has(bit: number): boolean {
    return (this.host.moveFlags & bit) !== 0;
  }

  private stateOf(bit: number): boolean {
    return ((this.host.moveFlags | this.host.observedFlags) & bit) !== 0;
  }

  private assertFree(): void {
    const reason = this.host.airBlock();
    if (reason) throw new Error(reason);
  }

  private assertPitching(): void {
    if (!this.has(MovementFlag.SWIMMING | MovementFlag.FLYING))
      throw new Error("not_swimming_or_flying");
  }

  private assertFlying(): void {
    if (!this.has(MovementFlag.FLYING)) throw new Error("not_flying");
  }

  private leaveIfGrounded(): void {
    if (this.has(MovementFlag.SWIMMING | MovementFlag.FLYING)) return;
    this.host.moveFlags &= ~PITCH_BITS;
  }

  private ascendLikeStop(): void {
    this.host.moveFlags &= ~VERTICAL_BITS;
    this.emit(GameOpcode.MSG_MOVE_STOP_ASCEND);
  }

  private pitchLikeStop(): void {
    this.host.moveFlags &= ~PITCH_BITS;
    this.emit(GameOpcode.MSG_MOVE_STOP_PITCH);
  }

  private emit(opcode: number): void {
    this.send(
      opcode,
      buildMoveMessage(this.selfGuid(), this.host.movementInfo()),
    );
  }
}
