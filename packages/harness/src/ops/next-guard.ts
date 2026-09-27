import type { WorldHandle } from "@tuicraft/core";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import {
  type CallShape,
  CONTINUES,
  parseCall,
  stable,
} from "#harness/ops/repeat-guard";
import { poseView } from "#harness/ops/views";

const GUARDED = new Set(["PARTLY", "REFUSED", "FAILED"]);

export function guardNext<A>(
  outcome: ToolResult<A>,
  init: CallShape & {
    blocked: (call: CallShape) => boolean;
    progressed: boolean;
  },
): ToolResult<A> {
  if (
    !GUARDED.has(outcome.status) ||
    outcome.next === undefined ||
    CONTINUES.includes(outcome.reason ?? "")
  )
    return outcome;
  const call = parseCall(outcome.next);
  if (!call) return outcome;
  const same =
    call.tool === init.tool && stable(call.args) === stable(init.args);
  if ((same && init.progressed) || !init.blocked(call)) return outcome;
  const how = outcome.status === "PARTLY" ? "stopped" : "failed";
  const why = outcome.reason ?? outcome.status.toLowerCase();
  const again = same
    ? "repeating it will not help"
    : `${call.tool} already failed from here`;
  return {
    ...outcome,
    next: `ask the human: "My ${init.tool} call ${how} (${why}) and ${again}. What should I do?"`,
  };
}

export function guardCall<A>(
  init: {
    args: unknown;
    handle: WorldHandle | undefined;
    rt: HarnessRuntime;
    startedAt: number;
    tool: ToolName;
  },
  outcome: ToolResult<A>,
): ToolResult<A> {
  const { handle, rt, startedAt } = init;
  const here = handle && {
    digest: rt.progress.digest(handle),
    pose: poseView({ handle, rt }),
  };
  return guardNext(outcome, {
    args: init.args as Record<string, unknown>,
    blocked: (call) =>
      here !== undefined &&
      rt.repeats.blocks({
        ...here,
        args: call.args,
        tool: call.tool as ToolName,
      }),
    progressed: (rt.progress.lastProgress()?.at ?? -1) >= startedAt,
    tool: init.tool,
  });
}
