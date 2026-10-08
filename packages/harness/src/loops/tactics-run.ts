import type {
  JevActionResult,
  JevCandidate,
  JevSelect,
} from "#harness/jev/contract";
import type { FramingVariant } from "#harness/jev/framing";
import type { TacticsBase } from "#harness/loops/tactics";

export type Run<C extends TacticsBase> = {
  runId: string;
  context: C & { framing: FramingVariant };
  select: JevSelect;
  abort: AbortController;
  detach: () => void;
  timeouts: number;
  transportFailures: number;
  fallback?: boolean;
  calls: number;
};

export type Decision<C extends TacticsBase> = {
  run: Run<C>;
  call: number;
  candidates: readonly JevCandidate[];
  sentAtMs: number;
  result: JevActionResult;
};
