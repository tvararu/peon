import type { OpcodeName } from "#wow/areas/contract";

export const NEVER_HANDLED: readonly OpcodeName[] = [
  "CMSG_COMPLETE_MOVIE",
  "SMSG_TOGGLE_XP_GAIN",
  "SMSG_CAMERA_SHAKE",
];

export const STUB_EXAMPLE: OpcodeName = "SMSG_CAMERA_SHAKE";
export const STUB_EXAMPLE_LABEL = "Camera shake";
