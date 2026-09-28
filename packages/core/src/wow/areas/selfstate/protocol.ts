import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag } from "#wow/self-store";

export type FlagChange = { readonly flag: MoveFlag; readonly enable: boolean };

export const FLAG_OPCODES: readonly (readonly [
  opcode: number,
  change: FlagChange,
])[] = [
  [GameOpcode.SMSG_MOVE_WATER_WALK, { flag: "water_walk", enable: true }],
  [GameOpcode.SMSG_MOVE_LAND_WALK, { flag: "water_walk", enable: false }],
  [GameOpcode.SMSG_MOVE_SET_HOVER, { flag: "hover", enable: true }],
  [GameOpcode.SMSG_MOVE_UNSET_HOVER, { flag: "hover", enable: false }],
];
