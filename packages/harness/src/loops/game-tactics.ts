import type { FramingVariant } from "#harness/jev/framing";
import type { CycleObjective } from "#harness/loops/cycle-types";
import type { EncounterCycleRuntime } from "#harness/loops/encounter-cycle";

export function kiteContext(
  context: {
    framing: FramingVariant | undefined;
    instruction: string;
    targetGuid: bigint;
  },
  kite: boolean | undefined,
): {
  framing: FramingVariant | undefined;
  instruction: string;
  targetGuid: bigint;
  kite?: boolean;
} {
  return kite === true ? { ...context, kite } : context;
}

export type CycleStart = {
  guids: bigint[];
  instruction: string;
  kite: boolean | undefined;
  maxStarts: number | undefined;
  objective?: CycleObjective;
};

export function cycleStart(
  cycle: EncounterCycleRuntime,
  args: CycleStart,
): Promise<void> {
  return cycle.start(args);
}
