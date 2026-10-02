import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag } from "#wow/self-store";

export type FlagAck = {
  bit: number;
  set: number;
  clear: number;
  applied: boolean;
};
export const DRIVEN_ACK_BITS =
  MovementFlag.DISABLE_GRAVITY |
  MovementFlag.HOVER |
  MovementFlag.WATERWALKING |
  MovementFlag.FALLING_SLOW;

export const FLAG_ACKS: Readonly<Record<MoveFlag, FlagAck>> = {
  water_walk: {
    bit: MovementFlag.WATERWALKING,
    set: GameOpcode.CMSG_MOVE_WATER_WALK_ACK,
    clear: GameOpcode.CMSG_MOVE_WATER_WALK_ACK,
    applied: true,
  },
  hover: {
    bit: MovementFlag.HOVER,
    set: GameOpcode.CMSG_MOVE_HOVER_ACK,
    clear: GameOpcode.CMSG_MOVE_HOVER_ACK,
    applied: true,
  },
  feather_fall: {
    bit: MovementFlag.FALLING_SLOW,
    set: GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK,
    clear: GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK,
    applied: true,
  },
  gravity_off: {
    bit: MovementFlag.DISABLE_GRAVITY,
    set: GameOpcode.CMSG_MOVE_GRAVITY_DISABLE_ACK,
    clear: GameOpcode.CMSG_MOVE_GRAVITY_ENABLE_ACK,
    applied: false,
  },
};
