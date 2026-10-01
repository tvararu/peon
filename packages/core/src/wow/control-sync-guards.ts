import { AIR_INPUT_BITS } from "#wow/control-swim";
import { MovementFlag, UnitFlag } from "#wow/protocol/entity-fields";

export const TRANSFER_ABORT_TIMEOUT_MS = 10_000;

export const RECONCILED_BITS =
  MovementFlag.SWIMMING | MovementFlag.FLYING | MovementFlag.CAN_FLY;

export const UNIT_BLOCK_FLAGS =
  UnitFlag.DISABLE_MOVE |
  UnitFlag.STUNNED |
  UnitFlag.CONFUSED |
  UnitFlag.FLEEING;

type FlagSources = {
  controlling: boolean;
  drivenFlags: number;
  moveFlags: number;
  observedFlags: number;
};

export function unsupportedFlags({
  controlling,
  drivenFlags,
  moveFlags,
  observedFlags,
}: FlagSources): number {
  const suspended = controlling ? MovementFlag.ON_TRANSPORT : 0;
  if (controlling) return (drivenFlags | moveFlags) & ~suspended;
  return (
    (observedFlags & ~suspended) |
    (moveFlags & (MovementFlag.SWIMMING | MovementFlag.FLYING | AIR_INPUT_BITS))
  );
}

export function canFlyFlags({
  controlling,
  drivenFlags,
  moveFlags,
  observedFlags,
}: FlagSources): number {
  const suspended = controlling ? MovementFlag.ON_TRANSPORT : 0;
  if (controlling) return (drivenFlags | moveFlags) & ~suspended;
  return observedFlags | moveFlags;
}
type ForcedSources = {
  flags: number;
  hasTransport: boolean;
  inputBits: number;
};

export function forcedPoseFlags({
  flags,
  hasTransport,
  inputBits,
}: ForcedSources): { move: number; observed: number } {
  const keep =
    hasTransport && (flags & MovementFlag.ON_TRANSPORT) !== 0
      ? MovementFlag.ON_TRANSPORT
      : 0;
  return {
    move: (flags & ~inputBits & ~MovementFlag.ON_TRANSPORT) | keep,
    observed: (flags & ~MovementFlag.ON_TRANSPORT) | keep,
  };
}

export class TransferAbortWatch {
  private timer: Timer | undefined;

  start(onTimeout: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      onTimeout();
    }, TRANSFER_ABORT_TIMEOUT_MS);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

type Timer = ReturnType<typeof setTimeout>;
